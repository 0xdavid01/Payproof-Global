use payproof_admin::AdminContract;
use near_sdk::{
    test_utils::VMContextBuilder,
    testing_env, AccountId, Gas, NearToken, PromiseError,
};

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str, block_height: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("admin.testnet"))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .block_height(block_height)
        .attached_deposit(NearToken::from_yoctonear(0))
        .prepaid_gas(Gas::from_tgas(300));

    testing_env!(builder.build());
}

fn payable_context(predecessor: &str, block_height: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("admin.testnet"))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .block_height(block_height)
        .attached_deposit(NearToken::from_yoctonear(1))
        .prepaid_gas(Gas::from_tgas(300));

    testing_env!(builder.build());
}

fn new_contract() -> AdminContract {
    context("admin.testnet", 1);

    AdminContract::new(
        account("admin.testnet"),
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        350,
    )
}

fn configured_contract() -> AdminContract {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    let _ = contract.set_escrow_contract(account("escrow.testnet"));

    context("admin.testnet", 3);
    let _ = contract.sync_configuration();

    let operation_id = contract.get_pending_operation_id().unwrap();
    let operation_version = contract.get_escrow_operation_version();
    let config_version = contract.get_desired_config_version();

    context("admin.testnet", 4);
    contract.on_configuration_sync(
        operation_id,
        config_version,
        operation_version,
        account("admin.testnet"),
        Ok(()),
    );

    contract
}

fn start_freeze(contract: &mut AdminContract, block: u64) -> (u64, u64) {
    context("admin.testnet", block);
    let _ = contract.freeze_escrow(
        "ESCROW-001".to_string(),
        "Test freeze".to_string(),
    );

    (
        contract.get_pending_operation_id().unwrap(),
        contract.get_escrow_operation_version(),
    )
}

// ---------------------------------------------------------
// Initialization
// ---------------------------------------------------------

#[test]
fn initializes_with_expected_configuration() {
    let contract = new_contract();

    assert_eq!(contract.get_admin(), account("admin.testnet"));
    assert_eq!(contract.get_treasury(), account("treasury.testnet"));
    assert_eq!(
        contract.get_dispute_resolver(),
        account("resolver.testnet")
    );
    assert_eq!(contract.get_usdt_contract(), account("usdt.testnet"));
    assert_eq!(contract.get_platform_fee_bps(), 350);
    assert_eq!(contract.get_desired_config_version(), 1);
    assert_eq!(contract.get_confirmed_config_version(), 0);
}

#[test]
fn starts_without_escrow_contract() {
    let contract = new_contract();

    assert_eq!(contract.get_escrow_contract(), None);
    assert_eq!(contract.get_config_sync_status(), "NOT_SYNCED");
}

#[test]
#[should_panic(expected = "Already initialized")]
fn cannot_initialize_twice() {
    let first = new_contract();

    near_sdk::env::state_write(&first);

    let _second = AdminContract::new(
        account("admin.testnet"),
        account("treasury.testnet"),
        account("resolver.testnet"),
        account("usdt.testnet"),
        350,
    );
}

// ---------------------------------------------------------
// Authorization
// ---------------------------------------------------------

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_set_treasury() {
    let mut contract = new_contract();

    context("attacker.testnet", 2);
    contract.set_treasury(account("newtreasury.testnet"));
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_set_dispute_resolver() {
    let mut contract = new_contract();

    context("attacker.testnet", 2);
    contract.set_dispute_resolver(account("newresolver.testnet"));
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_set_usdt_contract() {
    let mut contract = new_contract();

    context("attacker.testnet", 2);
    contract.set_usdt_contract(account("newusdt.testnet"));
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_set_platform_fee() {
    let mut contract = new_contract();

    context("attacker.testnet", 2);
    contract.set_platform_fee(400);
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_set_escrow_contract() {
    let mut contract = new_contract();

    payable_context("attacker.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_sync_configuration() {
    let mut contract = configured_contract();

    context("attacker.testnet", 5);
    let _ = contract.sync_configuration();
}

// ---------------------------------------------------------
// Configuration setters
// ---------------------------------------------------------

#[test]
fn admin_can_set_treasury() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_treasury(account("newtreasury.testnet"));

    assert_eq!(contract.get_treasury(), account("newtreasury.testnet"));
    assert_eq!(contract.get_desired_config_version(), 2);
    assert_eq!(contract.get_config_sync_status(), "OUT_OF_SYNC");
}

#[test]
fn admin_can_set_dispute_resolver() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_resolver(account("newresolver.testnet"));

    assert_eq!(
        contract.get_dispute_resolver(),
        account("newresolver.testnet")
    );
    assert_eq!(contract.get_desired_config_version(), 2);
}

#[test]
fn admin_can_set_usdt_contract() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_usdt_contract(account("newusdt.testnet"));

    assert_eq!(contract.get_usdt_contract(), account("newusdt.testnet"));
    assert_eq!(contract.get_desired_config_version(), 2);
}

#[test]
fn admin_can_set_platform_fee() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_platform_fee(400);

    assert_eq!(contract.get_platform_fee_bps(), 400);
    assert_eq!(contract.get_desired_config_version(), 2);
}

#[test]
#[should_panic(expected = "Treasury is unchanged")]
fn cannot_set_same_treasury() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_treasury(account("treasury.testnet"));
}

#[test]
#[should_panic(expected = "Dispute resolver is unchanged")]
fn cannot_set_same_dispute_resolver() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_resolver(account("resolver.testnet"));
}

#[test]
#[should_panic(expected = "USDT contract is unchanged")]
fn cannot_set_same_usdt_contract() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_usdt_contract(account("usdt.testnet"));
}

#[test]
#[should_panic(expected = "Platform fee is unchanged")]
fn cannot_set_same_platform_fee() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_platform_fee(350);
}

#[test]
fn multiple_configuration_changes_increment_version() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_treasury(account("newtreasury.testnet"));

    context("admin.testnet", 3);
    contract.set_platform_fee(400);

    context("admin.testnet", 4);
    contract.set_usdt_contract(account("newusdt.testnet"));

    assert_eq!(contract.get_desired_config_version(), 4);
}

// ---------------------------------------------------------
// Escrow configuration
// ---------------------------------------------------------

#[test]
fn admin_can_set_escrow_contract() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));

    assert_eq!(
        contract.get_escrow_contract(),
        Some(account("escrow.testnet"))
    );
    assert_eq!(contract.get_confirmed_config_version(), 0);
    assert_eq!(contract.get_desired_config_version(), 2);
    assert_eq!(contract.get_config_sync_status(), "NOT_SYNCED");
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn setting_escrow_requires_one_yocto() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));
}

#[test]
#[should_panic(expected = "Escrow contract is unchanged")]
fn cannot_set_same_escrow_contract() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));

    payable_context("admin.testnet", 3);
    contract.set_escrow_contract(account("escrow.testnet"));
}

#[test]
#[should_panic(expected = "Escrow contract has not been configured")]
fn cannot_sync_without_escrow_contract() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    let _ = contract.sync_configuration();
}

// ---------------------------------------------------------
// Configuration synchronization
// ---------------------------------------------------------

#[test]
fn configuration_sync_callback_confirms_success() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));

    context("admin.testnet", 3);
    let _ = contract.sync_configuration();

    let operation_id = contract.get_pending_operation_id().unwrap();
    let operation_version = contract.get_escrow_operation_version();
    let config_version = contract.get_desired_config_version();

    context("admin.testnet", 4);
    contract.on_configuration_sync(
        operation_id,
        config_version,
        operation_version,
        account("admin.testnet"),
        Ok(()),
    );

    assert_eq!(contract.get_confirmed_config_version(), config_version);
    assert_eq!(contract.get_config_sync_status(), "SYNCED");
    assert_eq!(contract.get_last_operation_status(), "CONFIRMED");
    assert_eq!(contract.get_pending_operation_id(), None);
}

#[test]
fn configuration_sync_callback_records_failure() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));

    context("admin.testnet", 3);
    let _ = contract.sync_configuration();

    let operation_id = contract.get_pending_operation_id().unwrap();
    let operation_version = contract.get_escrow_operation_version();
    let config_version = contract.get_desired_config_version();

    context("admin.testnet", 4);
    contract.on_configuration_sync(
        operation_id,
        config_version,
        operation_version,
        account("admin.testnet"),
        Err(PromiseError::Failed),
    );

    assert_eq!(contract.get_confirmed_config_version(), 0);
    assert_eq!(contract.get_config_sync_status(), "FAILED");
    assert_eq!(contract.get_last_operation_status(), "FAILED");
    assert_eq!(contract.get_pending_operation_id(), None);
}

#[test]
fn configuration_changes_after_sync_are_out_of_sync() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    contract.set_treasury(account("newtreasury.testnet"));

    assert_eq!(contract.get_config_sync_status(), "OUT_OF_SYNC");
    assert_ne!(
        contract.get_desired_config_version(),
        contract.get_confirmed_config_version()
    );
}

#[test]
#[should_panic(expected = "Another cross-contract operation is pending")]
fn cannot_start_second_operation_while_one_is_pending() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.sync_configuration();

    context("admin.testnet", 6);
    let _ = contract.sync_configuration();
}

// ---------------------------------------------------------
// Pause and unpause
// ---------------------------------------------------------

#[test]
fn starts_paused() {
    let contract = new_contract();

    assert!(contract.is_paused());
    assert!(!contract.is_pause_confirmed());
}

#[test]
#[should_panic(expected = "Escrow contract has not been configured")]
fn cannot_pause_without_escrow_contract() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    let _ = contract.pause_platform();
}

#[test]
#[should_panic(expected = "Escrow configuration must be synchronized first")]
fn cannot_pause_before_configuration_sync() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.set_escrow_contract(account("escrow.testnet"));

    context("admin.testnet", 3);
    let _ = contract.pause_platform();
}

#[test]
#[should_panic(expected = "Platform is already paused")]
fn cannot_pause_when_already_paused() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.pause_platform();
}

#[test]
#[should_panic(expected = "Escrow has not confirmed the paused state")]
fn cannot_unpause_without_confirmed_pause() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.unpause_platform();
}

// ---------------------------------------------------------
// Freeze and unfreeze
// ---------------------------------------------------------

#[test]
fn admin_can_freeze_escrow() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.freeze_escrow(
        "ESCROW-001".to_string(),
        "Dispute investigation".to_string(),
    );

    assert_eq!(
        contract.get_pending_operation(),
        Some("FREEZE_ESCROW".to_string())
    );
    assert_eq!(contract.get_escrow_operation_status(), "PENDING");
}

#[test]
fn admin_can_unfreeze_escrow() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.unfreeze_escrow(
        "ESCROW-001".to_string(),
        "Investigation completed".to_string(),
    );

    assert_eq!(
        contract.get_pending_operation(),
        Some("UNFREEZE_ESCROW".to_string())
    );
    assert_eq!(contract.get_escrow_operation_status(), "PENDING");
}

#[test]
#[should_panic(expected = "Escrow ID is required")]
fn cannot_freeze_empty_escrow_id() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.freeze_escrow(
        "".to_string(),
        "Investigation".to_string(),
    );
}

#[test]
#[should_panic(expected = "Reason is required")]
fn cannot_freeze_without_reason() {
    let mut contract = configured_contract();

    context("admin.testnet", 5);
    let _ = contract.freeze_escrow(
        "ESCROW-001".to_string(),
        "   ".to_string(),
    );
}

#[test]
fn freeze_callback_confirms_success() {
    let mut contract = configured_contract();

    let (operation_id, version) = start_freeze(&mut contract, 5);

    context("admin.testnet", 6);
    contract.on_escrow_control_complete(
        operation_id,
        "ESCROW-001".to_string(),
        "FREEZE".to_string(),
        version,
        account("admin.testnet"),
        Ok(()),
    );

    assert_eq!(contract.get_escrow_operation_status(), "CONFIRMED");
    assert_eq!(contract.get_last_operation_status(), "CONFIRMED");
}

#[test]
fn freeze_callback_records_failure() {
    let mut contract = configured_contract();

    let (operation_id, version) = start_freeze(&mut contract, 5);

    context("admin.testnet", 6);
    contract.on_escrow_control_complete(
        operation_id,
        "ESCROW-001".to_string(),
        "FREEZE".to_string(),
        version,
        account("admin.testnet"),
        Err(PromiseError::Failed),
    );

    assert_eq!(contract.get_escrow_operation_status(), "FAILED");
    assert_eq!(contract.get_last_operation_status(), "FAILED");
}

// ---------------------------------------------------------
// Recovery
// ---------------------------------------------------------

#[test]
#[should_panic(expected = "No pending operation")]
fn cannot_abort_when_no_operation_is_pending() {
    let mut contract = new_contract();

    context("admin.testnet", 200);
    contract.abort_pending_operation("Recovery".to_string());
}

#[test]
#[should_panic(expected = "Pending operation recovery delay has not elapsed")]
fn cannot_recover_before_delay() {
    let mut contract = configured_contract();

    context("admin.testnet", 10);
    let _ = contract.sync_configuration();

    context("admin.testnet", 110);
    contract.abort_pending_operation("Recovery".to_string());
}

#[test]
fn admin_can_recover_stale_operation_after_delay() {
    let mut contract = configured_contract();

    context("admin.testnet", 10);
    let _ = contract.sync_configuration();

    context("admin.testnet", 111);
    contract.abort_pending_operation("Escrow unavailable".to_string());

    assert_eq!(contract.get_pending_operation_id(), None);
    assert_eq!(contract.get_last_operation_status(), "ABORTED");
    assert_eq!(
        contract.get_last_operation_error(),
        Some("Escrow unavailable".to_string())
    );
}

#[test]
#[should_panic(expected = "Recovery reason is required")]
fn recovery_requires_reason() {
    let mut contract = configured_contract();

    context("admin.testnet", 10);
    let _ = contract.sync_configuration();

    context("admin.testnet", 200);
    contract.abort_pending_operation("   ".to_string());
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_recover_pending_operation() {
    let mut contract = configured_contract();

    context("admin.testnet", 10);
    let _ = contract.sync_configuration();

    context("attacker.testnet", 200);
    contract.abort_pending_operation("Recovery".to_string());
}

// ---------------------------------------------------------
// Admin transfer
// ---------------------------------------------------------

#[test]
fn admin_can_propose_transfer() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));

    assert_eq!(
        contract.get_pending_admin(),
        Some(account("newadmin.testnet"))
    );
}

#[test]
fn proposed_admin_can_accept_transfer() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));

    payable_context("newadmin.testnet", 3);
    contract.accept_admin_transfer();

    assert_eq!(contract.get_admin(), account("newadmin.testnet"));
    assert_eq!(contract.get_pending_admin(), None);
}

#[test]
fn admin_can_cancel_transfer() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));

    payable_context("admin.testnet", 3);
    contract.cancel_admin_transfer();

    assert_eq!(contract.get_pending_admin(), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn admin_transfer_proposal_requires_one_yocto() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn admin_transfer_acceptance_requires_one_yocto() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));

    context("newadmin.testnet", 3);
    contract.accept_admin_transfer();
}

#[test]
#[should_panic(expected = "Only the proposed administrator can accept")]
fn unrelated_account_cannot_accept_transfer() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));

    payable_context("attacker.testnet", 3);
    contract.accept_admin_transfer();
}

#[test]
#[should_panic(expected = "New administrator must differ")]
fn cannot_propose_current_admin() {
    let mut contract = new_contract();

    payable_context("admin.testnet", 2);
    contract.propose_admin_transfer(account("admin.testnet"));
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_propose_transfer() {
    let mut contract = new_contract();

    payable_context("attacker.testnet", 2);
    contract.propose_admin_transfer(account("newadmin.testnet"));
}

// ---------------------------------------------------------
// Dispute recommendations
// ---------------------------------------------------------

#[test]
fn admin_can_record_dispute_recommendation() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Release 50 percent to freelancer".to_string(),
    );

    assert_eq!(
        contract.get_dispute_recommendation("ESCROW-001".to_string()),
        Some("Release 50 percent to freelancer".to_string())
    );
}

#[test]
fn admin_can_update_dispute_recommendation() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Release 50 percent".to_string(),
    );

    context("admin.testnet", 3);
    contract.update_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Refund 100 percent".to_string(),
    );

    assert_eq!(
        contract.get_dispute_recommendation("ESCROW-001".to_string()),
        Some("Refund 100 percent".to_string())
    );
}

#[test]
#[should_panic(expected = "Recommendation already recorded")]
fn cannot_record_duplicate_dispute_recommendation() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Release 50 percent".to_string(),
    );

    context("admin.testnet", 3);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Refund 100 percent".to_string(),
    );
}

#[test]
#[should_panic(expected = "Recommendation is required")]
fn cannot_record_empty_recommendation() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "   ".to_string(),
    );
}

#[test]
#[should_panic(expected = "No recommendation exists")]
fn cannot_update_missing_dispute_recommendation() {
    let mut contract = new_contract();

    context("admin.testnet", 2);
    contract.update_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Release 50 percent".to_string(),
    );
}

#[test]
fn missing_dispute_recommendation_returns_none() {
    let contract = new_contract();

    assert_eq!(
        contract.get_dispute_recommendation("UNKNOWN".to_string()),
        None
    );
}

#[test]
#[should_panic(expected = "Only the administrator")]
fn non_admin_cannot_record_dispute_recommendation() {
    let mut contract = new_contract();

    context("attacker.testnet", 2);
    contract.set_dispute_recommendation(
        "ESCROW-001".to_string(),
        "Release 50 percent".to_string(),
    );
}

// ---------------------------------------------------------
// Views
// ---------------------------------------------------------

#[test]
fn configuration_view_contains_expected_fields() {
    let contract = new_contract();

    let view = contract.get_admin_configuration();

    assert_eq!(view["admin"], "admin.testnet");
    assert_eq!(view["treasury"], "treasury.testnet");
    assert_eq!(view["dispute_resolver"], "resolver.testnet");
    assert_eq!(view["usdt_contract"], "usdt.testnet");
    assert_eq!(view["platform_fee_bps"], 350);
    assert_eq!(view["paused"], true);
    assert_eq!(view["confirmed_paused"], false);
}

#[test]
fn failed_freeze_does_not_confirm_operation_version() {
    let mut contract = configured_contract();

    let confirmed_before = contract.get_confirmed_escrow_operation_version();
    let (operation_id, version) = start_freeze(&mut contract, 5);

    context("admin.testnet", 6);
    contract.on_escrow_control_complete(
        operation_id,
        "ESCROW-001".to_string(),
        "FREEZE".to_string(),
        version,
        account("admin.testnet"),
        Err(PromiseError::Failed),
    );

    assert_eq!(
        contract.get_confirmed_escrow_operation_version(),
        confirmed_before
    );
}

#[test]
fn stale_callback_does_not_finish_current_operation() {
    let mut contract = configured_contract();

    let (old_operation_id, old_version) = start_freeze(&mut contract, 5);

    context("admin.testnet", 200);
    contract.abort_pending_operation("Recovery".to_string());

    context("admin.testnet", 201);
    let _ = contract.sync_configuration();

    let new_operation_id = contract.get_pending_operation_id().unwrap();
    assert_ne!(old_operation_id, new_operation_id);

    let config_version = contract.get_desired_config_version();

    context("admin.testnet", 202);
    contract.on_configuration_sync(
        old_operation_id,
        config_version,
        old_version,
        account("admin.testnet"),
        Ok(()),
    );

    assert_eq!(
        contract.get_pending_operation_id(),
        Some(new_operation_id)
    );
    assert_eq!(
        contract.get_pending_operation(),
        Some("CONFIGURATION_SYNC".to_string())
    );
}