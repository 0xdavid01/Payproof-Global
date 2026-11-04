
use near_sdk::{
    json_types::U128,
    test_utils::VMContextBuilder,
    testing_env,
    AccountId,
    NearToken,
    PromiseError,
};
use payproof_escrow::{Asset, EscrowContract, EscrowStatus};

const AMOUNT: u128 = 1_000_000;

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn set_context(predecessor: &str, deposit: u128) {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id(account("escrow.testnet"))
        .signer_account_id(account(predecessor))
        .predecessor_account_id(account(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit));

    testing_env!(context.build());
}

fn configured_contract() -> (EscrowContract, AccountId, AccountId) {
    let admin = account("admin.testnet");
    let client = account("client.testnet");
    let freelancer = account("freelancer.testnet");

    set_context("admin.testnet", 0);
    let mut contract = EscrowContract::new(admin);

    contract.update_platform_config(
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        350,
        1,
        1,
    );

    set_context("admin.testnet", 0);
    contract.set_platform_paused(false, 2);

    (contract, client, freelancer)
}

fn create_near_escrow(
    contract: &mut EscrowContract,
    client: &AccountId,
    freelancer: &AccountId,
    id: &str,
) {
    set_context(client.as_str(), 1);

    contract.create_escrow(
        id.to_string(),
        freelancer.clone(),
        Asset::Near,
        U128(AMOUNT),
        "Test project".to_string(),
        "Test project description".to_string(),
    );
}

fn fund_near_escrow(
    contract: &mut EscrowContract,
    client: &AccountId,
    id: &str,
    amount: u128,
) {
    set_context(client.as_str(), amount);
    contract.fund_with_near(id.to_string());
}

fn get_status(contract: &EscrowContract, id: &str) -> EscrowStatus {
    contract
        .get_escrow(id.to_string())
        .unwrap()
        .status
}

fn submit_and_fund(
    contract: &mut EscrowContract,
    client: &AccountId,
    freelancer: &AccountId,
    id: &str,
) {
    create_near_escrow(contract, client, freelancer, id);
    fund_near_escrow(contract, client, id, AMOUNT);
    set_context(freelancer.as_str(), 0);
    contract.submit_work(id.to_string(), "https://example.com/evidence".to_string());
}

// ---------------------------------------------------------
// Initialization and configuration
// ---------------------------------------------------------

#[test]
fn initializes_successfully() {
    set_context("admin.testnet", 0);
    let contract = EscrowContract::new(account("admin.testnet"));

    assert!(contract.is_paused());
    assert_eq!(contract.get_config_version(), 0);
    assert_eq!(contract.get_operation_version(), 0);
}

#[test]
fn starts_paused() {
    set_context("admin.testnet", 0);
    let contract = EscrowContract::new(account("admin.testnet"));

    assert!(contract.is_paused());
}

#[test]
#[should_panic(expected = "Configuration is not synchronized")]
fn rejects_escrow_creation_before_configuration() {
    set_context("client.testnet", 1);
    let mut contract = EscrowContract::new(account("admin.testnet"));

    contract.create_escrow(
        "unconfigured".to_string(),
        account("freelancer.testnet"),
        Asset::Near,
        U128(AMOUNT),
        "Project".to_string(),
        "Description".to_string(),
    );
}

#[test]
#[should_panic(expected = "Only the Admin Contract")]
fn rejects_unauthorized_configuration_updates() {
    let (mut contract, _, _) = configured_contract();

    set_context("attacker.testnet", 0);
    contract.update_platform_config(
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        350,
        2,
        3,
    );
}

#[test]
#[should_panic(expected = "Only the Admin Contract")]
fn rejects_unauthorized_pause_updates() {
    let (mut contract, _, _) = configured_contract();

    set_context("attacker.testnet", 0);
    contract.set_platform_paused(true, 3);
}

#[test]
#[should_panic(expected = "Only the Admin Contract")]
fn rejects_unauthorized_escrow_freeze() {
    let (mut contract, client, freelancer) = configured_contract();
    create_near_escrow(&mut contract, &client, &freelancer, "freeze-test");

    set_context("attacker.testnet", 0);
    contract.freeze_escrow(
        "freeze-test".to_string(),
        "Unauthorized freeze".to_string(),
        1,
        3,
    );
}

// ---------------------------------------------------------
// Escrow creation validation
// ---------------------------------------------------------

#[test]
fn creates_near_escrow_successfully() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "create-test");

    let escrow = contract.get_escrow("create-test".to_string()).unwrap();

    assert_eq!(escrow.client, client);
    assert_eq!(escrow.freelancer, freelancer);
    assert_eq!(escrow.asset, Asset::Near);
    assert_eq!(escrow.amount, AMOUNT);
    assert_eq!(escrow.status, EscrowStatus::AwaitingFunding);
}

#[test]
#[should_panic(expected = "Escrow ID has already been used")]
fn rejects_duplicate_escrow_ids() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "duplicate-id");
    create_near_escrow(&mut contract, &client, &freelancer, "duplicate-id");
}

#[test]
#[should_panic(expected = "Amount must be greater than zero")]
fn rejects_zero_escrow_amount() {
    let (mut contract, client, freelancer) = configured_contract();

    set_context(client.as_str(), 1);
    contract.create_escrow(
        "zero-amount".to_string(),
        freelancer,
        Asset::Near,
        U128(0),
        "Zero amount".to_string(),
        "Must reject zero".to_string(),
    );
}

#[test]
#[should_panic(expected = "Client and freelancer must be different")]
fn rejects_client_as_freelancer() {
    let (mut contract, client, _) = configured_contract();

    set_context(client.as_str(), 1);
    contract.create_escrow(
        "same-party".to_string(),
        client.clone(),
        Asset::Near,
        U128(AMOUNT),
        "Invalid parties".to_string(),
        "Client cannot be freelancer".to_string(),
    );
}

#[test]
#[should_panic(expected = "Platform is paused")]
fn rejects_escrow_creation_when_paused() {
    let mut contract = EscrowContract::new(account("admin.testnet"));

    set_context("admin.testnet", 0);
    contract.update_platform_config(
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        350,
        1,
        1,
    );

    set_context("admin.testnet", 0);
    contract.set_platform_paused(true, 2);

    set_context("client.testnet", 1);
    contract.create_escrow(
        "paused-escrow".to_string(),
        account("freelancer.testnet"),
        Asset::Near,
        U128(AMOUNT),
        "Paused".to_string(),
        "Should fail".to_string(),
    );
}

// ---------------------------------------------------------
// Funding
// ---------------------------------------------------------

#[test]
fn funds_near_escrow_successfully() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "fund-test");
    fund_near_escrow(&mut contract, &client, "fund-test", AMOUNT);

    assert_eq!(get_status(&contract, "fund-test"), EscrowStatus::Funded);

    let escrow = contract.get_escrow("fund-test".to_string()).unwrap();
    assert_eq!(escrow.funded_amount, AMOUNT);
}

#[test]
#[should_panic(expected = "Deposit must exactly match")]
fn rejects_incorrect_near_deposit() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "incorrect-deposit");
    fund_near_escrow(&mut contract, &client, "incorrect-deposit", AMOUNT + 1);
}

#[test]
#[should_panic(expected = "Only the client can fund")]
fn rejects_funding_by_non_client() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "wrong-funder");

    set_context(freelancer.as_str(), AMOUNT);
    contract.fund_with_near("wrong-funder".to_string());
}

// ---------------------------------------------------------
// Work submission and approval
// ---------------------------------------------------------

#[test]
fn submits_work_successfully() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "submission-test");
    fund_near_escrow(&mut contract, &client, "submission-test", AMOUNT);

    set_context(freelancer.as_str(), 0);
    contract.submit_work(
        "submission-test".to_string(),
        "https://example.com/evidence".to_string(),
    );

    assert_eq!(
        get_status(&contract, "submission-test"),
        EscrowStatus::WorkSubmitted
    );
}

#[test]
#[should_panic(expected = "Only the freelancer can submit work")]
fn rejects_work_submission_by_wrong_account() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "wrong-submitter");
    fund_near_escrow(&mut contract, &client, "wrong-submitter", AMOUNT);

    set_context("attacker.testnet", 0);
    contract.submit_work(
        "wrong-submitter".to_string(),
        "Evidence".to_string(),
    );
}

#[test]
#[should_panic(expected = "Escrow must be funded")]
fn rejects_work_submission_before_funding() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "unfunded");

    set_context(freelancer.as_str(), 0);
    contract.submit_work("unfunded".to_string(), "Evidence".to_string());
}

#[test]
#[should_panic(expected = "Work has not been submitted")]
fn rejects_approval_before_work_submission() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "not-submitted");
    fund_near_escrow(&mut contract, &client, "not-submitted", AMOUNT);

    set_context(client.as_str(), 1);
    contract.approve_work("not-submitted".to_string());
}

// ---------------------------------------------------------
// Settlement and release
// ---------------------------------------------------------

#[test]
fn successful_release_records_fee_and_released_status() {
    let (mut contract, client, freelancer) = configured_contract();

    submit_and_fund(
        &mut contract,
        &client,
        &freelancer,
        "release-test",
    );

    set_context(client.as_str(), 1);
    let _promise = contract.approve_work("release-test".to_string());

    assert_eq!(get_status(&contract, "release-test"), EscrowStatus::Releasing);

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete(
        "release-test".to_string(),
        1,
        Ok(()),
    );

    assert_eq!(get_status(&contract, "release-test"), EscrowStatus::Released);

    let fees = contract.get_accrued_fees();
    assert_eq!(fees["near"].as_str().unwrap(), "35000");
}

#[test]
fn failed_release_can_be_retried() {
    let (mut contract, client, freelancer) = configured_contract();

    submit_and_fund(
        &mut contract,
        &client,
        &freelancer,
        "retry-test",
    );

    set_context(client.as_str(), 1);
    let _promise = contract.approve_work("retry-test".to_string());

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete(
        "retry-test".to_string(),
        1,
        Err(PromiseError::Failed),
    );

    assert_eq!(
        get_status(&contract, "retry-test"),
        EscrowStatus::SettlementFailed
    );

    set_context(client.as_str(), 1);
    let _retry = contract.retry_failed_settlement("retry-test".to_string());

    assert_eq!(get_status(&contract, "retry-test"), EscrowStatus::Releasing);

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete(
        "retry-test".to_string(),
        2,
        Ok(()),
    );

    assert_eq!(get_status(&contract, "retry-test"), EscrowStatus::Released);
}

// ---------------------------------------------------------
// Refunds and disputes
// ---------------------------------------------------------

#[test]
fn client_can_request_refund() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "refund-test");
    fund_near_escrow(&mut contract, &client, "refund-test", AMOUNT);

    set_context(client.as_str(), 1);
    contract.request_refund(
        "refund-test".to_string(),
        "Work not delivered".to_string(),
    );

    assert_eq!(get_status(&contract, "refund-test"), EscrowStatus::Disputed);
}

#[test]
#[should_panic(expected = "Only the client can request a refund")]
fn rejects_refund_request_by_unrelated_account() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "unauthorized-refund");
    fund_near_escrow(&mut contract, &client, "unauthorized-refund", AMOUNT);

    set_context("attacker.testnet", 1);
    contract.request_refund(
        "unauthorized-refund".to_string(),
        "Unauthorized request".to_string(),
    );
}

#[test]
fn dispute_resolver_can_release_funds() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "resolver-release");
    fund_near_escrow(&mut contract, &client, "resolver-release", AMOUNT);

    set_context(client.as_str(), 1);
    contract.raise_dispute(
        "resolver-release".to_string(),
        "Dispute".to_string(),
    );

    set_context("resolver.testnet", 1);
    let _promise = contract.resolve_dispute(
        "resolver-release".to_string(),
        true,
        "Release approved".to_string(),
    );

    assert_eq!(get_status(&contract, "resolver-release"), EscrowStatus::Releasing);
}

#[test]
#[should_panic(expected = "Only the client or freelancer")]
fn rejects_dispute_by_unrelated_account() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "unauthorized-dispute");
    fund_near_escrow(&mut contract, &client, "unauthorized-dispute", AMOUNT);

    set_context("attacker.testnet", 1);
    contract.raise_dispute(
        "unauthorized-dispute".to_string(),
        "Unauthorized".to_string(),
    );
}

#[test]
#[should_panic(expected = "Only the dispute resolver")]
fn rejects_dispute_resolution_by_non_resolver() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "unauthorized-resolution");
    fund_near_escrow(&mut contract, &client, "unauthorized-resolution", AMOUNT);

    set_context(client.as_str(), 1);
    contract.raise_dispute(
        "unauthorized-resolution".to_string(),
        "Dispute".to_string(),
    );

    set_context("attacker.testnet", 1);
    let _promise = contract.resolve_dispute(
        "unauthorized-resolution".to_string(),
        true,
        "Unauthorized".to_string(),
    );
}

// ---------------------------------------------------------
// Freeze and unfreeze
// ---------------------------------------------------------

#[test]
fn admin_can_freeze_and_unfreeze_escrow() {
    let (mut contract, client, freelancer) = configured_contract();

    create_near_escrow(&mut contract, &client, &freelancer, "freeze-cycle");

    set_context("admin.testnet", 0);
    contract.freeze_escrow(
        "freeze-cycle".to_string(),
        "Security review".to_string(),
        1,
        3,
    );

    assert!(contract.get_escrow("freeze-cycle".to_string()).unwrap().frozen);

    set_context("admin.testnet", 0);
    contract.unfreeze_escrow(
        "freeze-cycle".to_string(),
        "Review completed".to_string(),
        1,
        4,
    );

    assert!(!contract.get_escrow("freeze-cycle".to_string()).unwrap().frozen);
}

// ---------------------------------------------------------
// Fee withdrawal and callback
// ---------------------------------------------------------

#[test]
fn failed_fee_withdrawal_restores_accrued_fees() {
    let (mut contract, client, freelancer) = configured_contract();

    submit_and_fund(
        &mut contract,
        &client,
        &freelancer,
        "fee-withdrawal-test",
    );

    set_context(client.as_str(), 1);
    let _promise = contract.approve_work("fee-withdrawal-test".to_string());

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete(
        "fee-withdrawal-test".to_string(),
        1,
        Ok(()),
    );

    set_context("admin.testnet", 1);
    let _withdrawal = contract.withdraw_platform_fees(
        Asset::Near,
        U128(35000),
    );

    let before = contract.get_accrued_fees();
    assert_eq!(before["near"].as_str().unwrap(), "0");

    set_context("escrow.testnet", 0);
    contract.on_fee_withdrawal_complete(
        2,
        Asset::Near,
        U128(35000),
        Err(PromiseError::Failed),
    );

    let after = contract.get_accrued_fees();
    assert_eq!(after["near"].as_str().unwrap(), "35000");
    assert_eq!(after["pending_withdrawal"], false);
}

// ---------------------------------------------------------
// Stale callback protection
// ---------------------------------------------------------

#[test]
fn stale_settlement_callback_does_not_change_escrow() {
    let (mut contract, client, freelancer) = configured_contract();

    submit_and_fund(
        &mut contract,
        &client,
        &freelancer,
        "stale-callback-test",
    );

    set_context(client.as_str(), 1);
    let _promise = contract.approve_work("stale-callback-test".to_string());

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete(
        "stale-callback-test".to_string(),
        999,
        Ok(()),
    );

    assert_eq!(
        get_status(&contract, "stale-callback-test"),
        EscrowStatus::Releasing
    );
}
