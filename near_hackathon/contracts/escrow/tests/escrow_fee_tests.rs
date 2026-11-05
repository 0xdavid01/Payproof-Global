use near_sdk::{
    json_types::U128,
    test_utils::VMContextBuilder,
    testing_env,
    AccountId,
    NearToken,
};
use payproof_escrow::{EscrowContract, EscrowStatus};

const PROJECT_AMOUNT: u128 = 1_000_000;
const PLATFORM_FEE: u128 = 35_000;
const TOTAL_FUNDING: u128 = PROJECT_AMOUNT + PLATFORM_FEE;

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

fn configured_contract() -> EscrowContract {
    set_context("admin.testnet", 0);
    let mut contract = EscrowContract::new(account("admin.testnet"));

    contract.update_platform_config(
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        account("usdc.testnet"),
        350,
        1,
        1,
    );

    set_context("admin.testnet", 0);
    contract.set_platform_paused(false, 2);
    contract
}

#[test]
fn client_funds_project_amount_plus_fee_and_freelancer_gets_full_amount() {
    let mut contract = configured_contract();
    let freelancer = account("freelancer.testnet");

    set_context("client.testnet", TOTAL_FUNDING);
    contract.create_and_fund_with_near(
        "client-fee-test".to_string(),
        freelancer.clone(),
        U128(PROJECT_AMOUNT),
        "Test project".to_string(),
        "Description".to_string(),
    );

    let funded = contract.get_escrow("client-fee-test".to_string()).unwrap();
    assert_eq!(funded.amount, PROJECT_AMOUNT);
    assert_eq!(funded.funded_amount, TOTAL_FUNDING);
    assert_eq!(funded.platform_fee, PLATFORM_FEE);

    set_context("freelancer.testnet", 0);
    contract.submit_work(
        "client-fee-test".to_string(),
        "Evidence".to_string(),
    );

    set_context("client.testnet", 1);
    let _release = contract.approve_work("client-fee-test".to_string());

    let releasing = contract.get_escrow("client-fee-test".to_string()).unwrap();
    assert_eq!(releasing.status, EscrowStatus::Releasing);
    assert_eq!(releasing.settlement_amount, PROJECT_AMOUNT);
    assert_eq!(releasing.platform_fee, PLATFORM_FEE);

    set_context("escrow.testnet", 0);
    contract.on_settlement_complete("client-fee-test".to_string(), 1, Ok(()));

    let released = contract.get_escrow("client-fee-test".to_string()).unwrap();
    assert_eq!(released.status, EscrowStatus::Released);
    assert_eq!(
        contract.get_accrued_fees()["near"].as_str().unwrap(),
        PLATFORM_FEE.to_string()
    );
}

#[test]
#[should_panic(expected = "Deposit must include the platform fee")]
fn rejects_funding_without_the_client_platform_fee() {
    let mut contract = configured_contract();

    set_context("client.testnet", PROJECT_AMOUNT);
    contract.create_and_fund_with_near(
        "missing-client-fee".to_string(),
        account("freelancer.testnet"),
        U128(PROJECT_AMOUNT),
        "Test project".to_string(),
        "Description".to_string(),
    );
}
