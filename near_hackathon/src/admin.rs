
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, AccountId, Gas, PanicOnDefault,
    Promise, PromiseError,
};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;

const ESCROW_CALL_GAS: Gas = Gas::from_tgas(20);
const CALLBACK_GAS: Gas = Gas::from_tgas(20);
const RECOVERY_DELAY_BLOCKS: u64 = 100;

#[allow(dead_code)]
#[ext_contract(ext_escrow)]
pub trait EscrowInterface {
    fn freeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
        config_version: u64,
        operation_version: u64,
    );

    fn unfreeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
        config_version: u64,
        operation_version: u64,
    );

    fn set_platform_paused(
        &mut self,
        paused: bool,
        operation_version: u64,
    );

    fn update_platform_config(
        &mut self,
        treasury: AccountId,
        dispute_resolver: AccountId,
        usdt_contract: AccountId,
        platform_fee_bps: u32,
        config_version: u64,
        operation_version: u64,
    );
}

#[allow(dead_code)]
#[ext_contract(ext_self)]
pub trait AdminCallbacks {
    fn on_configuration_sync(
        &mut self,
        operation_id: u64,
        requested_config_version: u64,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    );

    fn on_pause_complete(
        &mut self,
        operation_id: u64,
        requested_paused: bool,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    );

    fn on_escrow_control_complete(
        &mut self,
        operation_id: u64,
        escrow_id: String,
        action: String,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    );
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AdminContract {
    admin: AccountId,
    pending_admin: Option<AccountId>,

    treasury: AccountId,
    dispute_resolver: AccountId,
    escrow_contract: Option<AccountId>,
    usdt_contract: AccountId,

    platform_fee_bps: u32,

    desired_config_version: u64,
    confirmed_config_version: u64,

    paused: bool,
    confirmed_paused: bool,
    confirmed_paused_version: u64,

    escrow_operation_version: u64,
    confirmed_escrow_operation_version: u64,

    operation_nonce: u64,
    pending_operation_id: Option<u64>,
    pending_operation: Option<String>,
    pending_started_height: Option<u64>,
    pending_operation_version: Option<u64>,
    pending_initiator: Option<AccountId>,

    last_operation_status: String,
    last_operation_error: Option<String>,

    last_config_sync_timestamp_ns: Option<u64>,
    last_config_sync_status: String,

    last_escrow_operation_id: Option<u64>,
    last_escrow_id: Option<String>,
    last_escrow_operation: Option<String>,
    last_escrow_operation_status: String,

    dispute_recommendations: LookupMap<String, String>,
}

#[near]
impl AdminContract {
    #[init]
    pub fn new(
        admin: AccountId,
        treasury: AccountId,
        dispute_resolver: AccountId,
        usdt_contract: AccountId,
        platform_fee_bps: u32,
    ) -> Self {
        assert!(!env::state_exists(), "Already initialized");

        Self {
            admin,
            pending_admin: None,
            treasury,
            dispute_resolver,
            escrow_contract: None,
            usdt_contract,
            platform_fee_bps,

            desired_config_version: 1,
            confirmed_config_version: 0,

            paused: true,
            confirmed_paused: false,
            confirmed_paused_version: 0,

            escrow_operation_version: 0,
            confirmed_escrow_operation_version: 0,

            operation_nonce: 0,
            pending_operation_id: None,
            pending_operation: None,
            pending_started_height: None,
            pending_operation_version: None,
            pending_initiator: None,

            last_operation_status: "IDLE".to_string(),
            last_operation_error: None,

            last_config_sync_timestamp_ns: None,
            last_config_sync_status: "NOT_SYNCED".to_string(),

            last_escrow_operation_id: None,
            last_escrow_id: None,
            last_escrow_operation: None,
            last_escrow_operation_status: "IDLE".to_string(),

            dispute_recommendations: LookupMap::new(
                b"dispute_recommendations".to_vec(),
            ),
        }
    }

    // ---------------------------------------------------------
    // Internal authorization and version helpers
    // ---------------------------------------------------------

    fn assert_admin(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.admin,
            "Only the administrator can perform this action"
        );
    }

    fn assert_no_pending_operation(&self) {
        assert!(
            self.pending_operation_id.is_none(),
            "Another cross-contract operation is pending"
        );
    }

    fn assert_escrow_configured(&self) -> AccountId {
        self.escrow_contract
            .clone()
            .expect("Escrow contract has not been configured")
    }

    fn assert_escrow_synced(&self) {
        assert!(
            self.confirmed_config_version == self.desired_config_version,
            "Escrow configuration must be synchronized first"
        );
    }

    fn assert_current_operation(&self, operation_id: u64) -> bool {
        if self.pending_operation_id != Some(operation_id) {
            env::log_str("Ignoring stale callback");
            return false;
        }

        true
    }

    fn next_operation_id(&mut self) -> u64 {
        self.operation_nonce = self
            .operation_nonce
            .checked_add(1)
            .expect("Operation ID overflow");

        self.operation_nonce
    }

    fn next_escrow_operation_version(&mut self) -> u64 {
        self.escrow_operation_version = self
            .escrow_operation_version
            .checked_add(1)
            .expect("Escrow operation version overflow");

        self.escrow_operation_version
    }

    fn increment_desired_config_version(&mut self) {
        self.desired_config_version = self
            .desired_config_version
            .checked_add(1)
            .expect("Configuration version overflow");
    }

    fn start_operation(&mut self, operation: &str) -> (u64, u64, AccountId) {
        self.assert_no_pending_operation();

        let initiator = env::predecessor_account_id();
        let operation_id = self.next_operation_id();
        let operation_version = self.next_escrow_operation_version();

        self.pending_operation_id = Some(operation_id);
        self.pending_operation = Some(operation.to_string());
        self.pending_started_height = Some(env::block_height());
        self.pending_operation_version = Some(operation_version);
        self.pending_initiator = Some(initiator.clone());

        self.last_operation_status = "PENDING".to_string();
        self.last_operation_error = None;

        (operation_id, operation_version, initiator)
    }

    fn finish_operation(
        &mut self,
        operation_id: u64,
        operation: &str,
        operation_version: u64,
        initiator: AccountId,
        success: bool,
        error: Option<String>,
    ) {
        if !self.assert_current_operation(operation_id) {
            return;
        }

        if success {
            self.confirmed_escrow_operation_version = operation_version;
        }

        self.last_operation_status = if success {
            "CONFIRMED".to_string()
        } else {
            "FAILED".to_string()
        };

        self.last_operation_error = error;

        self.pending_operation_id = None;
        self.pending_operation = None;
        self.pending_started_height = None;
        self.pending_operation_version = None;
        self.pending_initiator = None;

        self.log_event(
            if success {
                "CROSS_CONTRACT_OPERATION_CONFIRMED"
            } else {
                "CROSS_CONTRACT_OPERATION_FAILED"
            },
            initiator,
            json!({
                "operation_id": operation_id,
                "operation": operation,
                "operation_version": operation_version
            }),
        );
    }

    fn log_event(&self, event_name: &str, initiator: AccountId, details: Value) {
        let event = json!({
            "standard": "payproof_admin",
            "version": "1.0.0",
            "event": event_name,
            "data": [{
                "actor": env::current_account_id(),
                "initiator": initiator,
                "timestamp_ns": env::block_timestamp(),
                "desired_config_version": self.desired_config_version,
                "confirmed_config_version": self.confirmed_config_version,
                "escrow_operation_version": self.escrow_operation_version,
                "confirmed_escrow_operation_version": self.confirmed_escrow_operation_version,
                "details": details
            }]
        });

        env::log_str(&format!("EVENT_JSON:{}", event));
    }

    // ---------------------------------------------------------
    // Views
    // ---------------------------------------------------------

    pub fn get_admin(&self) -> AccountId {
        self.admin.clone()
    }

    pub fn get_pending_admin(&self) -> Option<AccountId> {
        self.pending_admin.clone()
    }

    pub fn get_treasury(&self) -> AccountId {
        self.treasury.clone()
    }

    pub fn get_dispute_resolver(&self) -> AccountId {
        self.dispute_resolver.clone()
    }

    pub fn get_escrow_contract(&self) -> Option<AccountId> {
        self.escrow_contract.clone()
    }

    pub fn get_usdt_contract(&self) -> AccountId {
        self.usdt_contract.clone()
    }

    pub fn get_platform_fee_bps(&self) -> u32 {
        self.platform_fee_bps
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn is_pause_confirmed(&self) -> bool {
        self.confirmed_paused
    }

    pub fn get_confirmed_paused_version(&self) -> u64 {
        self.confirmed_paused_version
    }

    pub fn get_config_version(&self) -> u64 {
        self.confirmed_config_version
    }

    pub fn get_desired_config_version(&self) -> u64 {
        self.desired_config_version
    }

    pub fn get_confirmed_config_version(&self) -> u64 {
        self.confirmed_config_version
    }

    pub fn get_escrow_operation_version(&self) -> u64 {
        self.escrow_operation_version
    }

    pub fn get_confirmed_escrow_operation_version(&self) -> u64 {
        self.confirmed_escrow_operation_version
    }

    pub fn get_config_sync_status(&self) -> String {
        self.last_config_sync_status.clone()
    }

    pub fn get_last_operation_status(&self) -> String {
        self.last_operation_status.clone()
    }

    pub fn get_last_operation_error(&self) -> Option<String> {
        self.last_operation_error.clone()
    }

    pub fn get_pending_operation(&self) -> Option<String> {
        self.pending_operation.clone()
    }

    pub fn get_pending_operation_id(&self) -> Option<u64> {
        self.pending_operation_id
    }

    pub fn get_pending_started_height(&self) -> Option<u64> {
        self.pending_started_height
    }

    pub fn get_escrow_operation_status(&self) -> String {
        self.last_escrow_operation_status.clone()
    }

    pub fn get_dispute_recommendation(
        &self,
        escrow_id: String,
    ) -> Option<String> {
        self.dispute_recommendations.get(&escrow_id).cloned()
    }

    pub fn get_admin_configuration(&self) -> Value {
        json!({
            "admin": self.admin,
            "pending_admin": self.pending_admin,
            "treasury": self.treasury,
            "dispute_resolver": self.dispute_resolver,
            "escrow_contract": self.escrow_contract,
            "usdt_contract": self.usdt_contract,
            "platform_fee_bps": self.platform_fee_bps,
            "desired_config_version": self.desired_config_version,
            "confirmed_config_version": self.confirmed_config_version,
            "paused": self.paused,
            "confirmed_paused": self.confirmed_paused,
            "confirmed_paused_version": self.confirmed_paused_version,
            "escrow_operation_version": self.escrow_operation_version,
            "confirmed_escrow_operation_version": self.confirmed_escrow_operation_version,
            "pending_operation_id": self.pending_operation_id,
            "pending_operation": self.pending_operation,
            "pending_started_height": self.pending_started_height,
            "last_operation_status": self.last_operation_status,
            "last_operation_error": self.last_operation_error,
            "last_config_sync_timestamp_ns": self.last_config_sync_timestamp_ns,
            "last_config_sync_status": self.last_config_sync_status,
            "last_escrow_operation_id": self.last_escrow_operation_id,
            "last_escrow_id": self.last_escrow_id,
            "last_escrow_operation": self.last_escrow_operation,
            "last_escrow_operation_status": self.last_escrow_operation_status
        })
    }

    // ---------------------------------------------------------
    // Administrator transfer
    // ---------------------------------------------------------

    #[payable]
    pub fn propose_admin_transfer(&mut self, new_admin: AccountId) {
        assert_one_yocto();
        self.assert_admin();

        assert_ne!(new_admin, self.admin, "New administrator must differ");

        self.pending_admin = Some(new_admin.clone());

        self.log_event(
            "ADMIN_TRANSFER_PROPOSED",
            env::predecessor_account_id(),
            json!({"new_admin": new_admin}),
        );
    }

    #[payable]
    pub fn accept_admin_transfer(&mut self) {
        assert_one_yocto();

        let caller = env::predecessor_account_id();

        assert_eq!(
            self.pending_admin.as_ref(),
            Some(&caller),
            "Only the proposed administrator can accept"
        );

        let old_admin = self.admin.clone();

        self.admin = caller.clone();
        self.pending_admin = None;

        self.log_event(
            "ADMIN_TRANSFER_ACCEPTED",
            caller.clone(),
            json!({
                "old_admin": old_admin,
                "new_admin": caller
            }),
        );
    }

    #[payable]
    pub fn cancel_admin_transfer(&mut self) {
        assert_one_yocto();
        self.assert_admin();

        let cancelled = self.pending_admin.take();

        self.log_event(
            "ADMIN_TRANSFER_CANCELLED",
            env::predecessor_account_id(),
            json!({"cancelled_admin": cancelled}),
        );
    }

    // ---------------------------------------------------------
    // Configuration setters
    // ---------------------------------------------------------

    pub fn set_treasury(&mut self, treasury: AccountId) {
        self.assert_admin();
        assert_ne!(treasury, self.treasury, "Treasury is unchanged");

        self.treasury = treasury.clone();
        self.increment_desired_config_version();
        self.last_config_sync_status = "OUT_OF_SYNC".to_string();

        self.log_event(
            "TREASURY_UPDATED",
            env::predecessor_account_id(),
            json!({"treasury": treasury}),
        );
    }

    pub fn set_dispute_resolver(&mut self, resolver: AccountId) {
        self.assert_admin();

        assert_ne!(
            resolver,
            self.dispute_resolver,
            "Dispute resolver is unchanged"
        );

        self.dispute_resolver = resolver.clone();
        self.increment_desired_config_version();
        self.last_config_sync_status = "OUT_OF_SYNC".to_string();

        self.log_event(
            "DISPUTE_RESOLVER_UPDATED",
            env::predecessor_account_id(),
            json!({"dispute_resolver": resolver}),
        );
    }

    #[payable]
    pub fn set_escrow_contract(&mut self, escrow: AccountId) {
        assert_one_yocto();
        self.assert_admin();
        self.assert_no_pending_operation();

        assert_ne!(
            self.escrow_contract.as_ref(),
            Some(&escrow),
            "Escrow contract is unchanged"
        );

        self.escrow_contract = Some(escrow.clone());

        self.confirmed_config_version = 0;
        self.confirmed_paused = false;
        self.confirmed_paused_version = 0;
        self.confirmed_escrow_operation_version = 0;

        self.paused = true;

        self.increment_desired_config_version();
        self.last_config_sync_status = "NOT_SYNCED".to_string();

        self.log_event(
            "ESCROW_CONTRACT_UPDATED",
            env::predecessor_account_id(),
            json!({
                "escrow_contract": escrow,
                "requires_configuration_sync": true
            }),
        );
    }

    pub fn set_usdt_contract(&mut self, usdt_contract: AccountId) {
        self.assert_admin();

        assert_ne!(
            usdt_contract,
            self.usdt_contract,
            "USDT contract is unchanged"
        );

        self.usdt_contract = usdt_contract.clone();
        self.increment_desired_config_version();
        self.last_config_sync_status = "OUT_OF_SYNC".to_string();

        self.log_event(
            "USDT_CONTRACT_UPDATED",
            env::predecessor_account_id(),
            json!({"usdt_contract": usdt_contract}),
        );
    }

    pub fn set_platform_fee(&mut self, fee_bps: u32) {
        self.assert_admin();

        assert_ne!(
            fee_bps,
            self.platform_fee_bps,
            "Platform fee is unchanged"
        );

        self.platform_fee_bps = fee_bps;
        self.increment_desired_config_version();
        self.last_config_sync_status = "OUT_OF_SYNC".to_string();

        self.log_event(
            "PLATFORM_FEE_UPDATED",
            env::predecessor_account_id(),
            json!({"platform_fee_bps": fee_bps}),
        );
    }

    // ---------------------------------------------------------
    // Configuration synchronization
    // ---------------------------------------------------------

    pub fn sync_configuration(&mut self) -> Promise {
        self.assert_admin();
        self.assert_no_pending_operation();

        let escrow = self.assert_escrow_configured();

        let (operation_id, operation_version, initiator) =
            self.start_operation("CONFIGURATION_SYNC");

        let requested_config_version = self.desired_config_version;

        self.last_config_sync_status = "PENDING".to_string();

        ext_escrow::ext(escrow)
            .with_static_gas(ESCROW_CALL_GAS)
            .update_platform_config(
                self.treasury.clone(),
                self.dispute_resolver.clone(),
                self.usdt_contract.clone(),
                self.platform_fee_bps,
                requested_config_version,
                operation_version,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_configuration_sync(
                        operation_id,
                        requested_config_version,
                        operation_version,
                        initiator,
                    ),
            )
    }

    #[private]
    pub fn on_configuration_sync(
        &mut self,
        operation_id: u64,
        requested_config_version: u64,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if !self.assert_current_operation(operation_id) {
            return;
        }

        match result {
            Ok(()) => {
                self.confirmed_config_version = requested_config_version;
                self.last_config_sync_timestamp_ns = Some(env::block_timestamp());

                self.last_config_sync_status =
                    if requested_config_version == self.desired_config_version {
                        "SYNCED".to_string()
                    } else {
                        "OUT_OF_SYNC".to_string()
                    };

                self.finish_operation(
                    operation_id,
                    "CONFIGURATION_SYNC",
                    operation_version,
                    initiator,
                    true,
                    None,
                );
            }
            Err(error) => {
                self.last_config_sync_status = "FAILED".to_string();

                self.finish_operation(
                    operation_id,
                    "CONFIGURATION_SYNC",
                    operation_version,
                    initiator,
                    false,
                    Some(format!("{:?}", error)),
                );
            }
        }
    }

    // ---------------------------------------------------------
    // Pause and unpause
    // ---------------------------------------------------------

    pub fn pause_platform(&mut self) -> Promise {
        self.assert_admin();
        self.assert_no_pending_operation();

        let escrow = self.assert_escrow_configured();
        self.assert_escrow_synced();

        assert!(!self.paused, "Platform is already paused");

        let (operation_id, operation_version, initiator) =
            self.start_operation("PAUSE_PLATFORM");

        self.paused = true;

        ext_escrow::ext(escrow)
            .with_static_gas(ESCROW_CALL_GAS)
            .set_platform_paused(true, operation_version)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_pause_complete(
                        operation_id,
                        true,
                        operation_version,
                        initiator,
                    ),
            )
    }

    pub fn unpause_platform(&mut self) -> Promise {
        self.assert_admin();
        self.assert_no_pending_operation();

        let escrow = self.assert_escrow_configured();
        self.assert_escrow_synced();

        assert!(self.paused, "Platform is not paused");
        assert!(
            self.confirmed_paused,
            "Escrow has not confirmed the paused state"
        );

        let (operation_id, operation_version, initiator) =
            self.start_operation("UNPAUSE_PLATFORM");

        ext_escrow::ext(escrow)
            .with_static_gas(ESCROW_CALL_GAS)
            .set_platform_paused(false, operation_version)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_pause_complete(
                        operation_id,
                        false,
                        operation_version,
                        initiator,
                    ),
            )
    }

    #[private]
    pub fn on_pause_complete(
        &mut self,
        operation_id: u64,
        requested_paused: bool,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if !self.assert_current_operation(operation_id) {
            return;
        }

        match result {
            Ok(()) => {
                self.confirmed_paused = requested_paused;
                self.confirmed_paused_version = operation_version;

                if !requested_paused {
                    self.paused = false;
                }

                self.finish_operation(
                    operation_id,
                    if requested_paused {
                        "PAUSE_PLATFORM"
                    } else {
                        "UNPAUSE_PLATFORM"
                    },
                    operation_version,
                    initiator,
                    true,
                    None,
                );
            }
            Err(error) => {
                if !requested_paused {
                    self.paused = true;
                }

                self.finish_operation(
                    operation_id,
                    if requested_paused {
                        "PAUSE_PLATFORM"
                    } else {
                        "UNPAUSE_PLATFORM"
                    },
                    operation_version,
                    initiator,
                    false,
                    Some(format!("{:?}", error)),
                );
            }
        }
    }

    // ---------------------------------------------------------
    // Freeze and unfreeze individual escrows
    // ---------------------------------------------------------

    pub fn freeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
    ) -> Promise {
        self.assert_admin();

        let escrow = self.assert_escrow_configured();
        self.assert_escrow_synced();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(!reason.trim().is_empty(), "Reason is required");

        let (operation_id, operation_version, initiator) =
            self.start_operation("FREEZE_ESCROW");

        self.last_escrow_operation_id = Some(operation_id);
        self.last_escrow_id = Some(escrow_id.clone());
        self.last_escrow_operation = Some("FREEZE".to_string());
        self.last_escrow_operation_status = "PENDING".to_string();

        ext_escrow::ext(escrow)
            .with_static_gas(ESCROW_CALL_GAS)
            .freeze_escrow(
                escrow_id.clone(),
                reason,
                self.desired_config_version,
                operation_version,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_escrow_control_complete(
                        operation_id,
                        escrow_id,
                        "FREEZE".to_string(),
                        operation_version,
                        initiator,
                    ),
            )
    }

    pub fn unfreeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
    ) -> Promise {
        self.assert_admin();

        let escrow = self.assert_escrow_configured();
        self.assert_escrow_synced();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(!reason.trim().is_empty(), "Reason is required");

        let (operation_id, operation_version, initiator) =
            self.start_operation("UNFREEZE_ESCROW");

        self.last_escrow_operation_id = Some(operation_id);
        self.last_escrow_id = Some(escrow_id.clone());
        self.last_escrow_operation = Some("UNFREEZE".to_string());
        self.last_escrow_operation_status = "PENDING".to_string();

        ext_escrow::ext(escrow)
            .with_static_gas(ESCROW_CALL_GAS)
            .unfreeze_escrow(
                escrow_id.clone(),
                reason,
                self.desired_config_version,
                operation_version,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_escrow_control_complete(
                        operation_id,
                        escrow_id,
                        "UNFREEZE".to_string(),
                        operation_version,
                        initiator,
                    ),
            )
    }

    #[private]
    pub fn on_escrow_control_complete(
        &mut self,
        operation_id: u64,
        escrow_id: String,
        action: String,
        operation_version: u64,
        initiator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if !self.assert_current_operation(operation_id) {
            return;
        }

        let success = result.is_ok();

        self.last_escrow_operation_status = if success {
            "CONFIRMED".to_string()
        } else {
            "FAILED".to_string()
        };

        let error = result.err().map(|e| format!("{:?}", e));

        self.finish_operation(
            operation_id,
            &format!("{}_ESCROW", action),
            operation_version,
            initiator.clone(),
            success,
            error,
        );

        self.log_event(
            "ESCROW_CONTROL_CALLBACK",
            initiator,
            json!({
                "operation_id": operation_id,
                "escrow_id": escrow_id,
                "action": action,
                "operation_version": operation_version,
                "status": self.last_escrow_operation_status
            }),
        );
    }

    // ---------------------------------------------------------
    // Delayed pending-operation recovery
    // ---------------------------------------------------------

    pub fn abort_pending_operation(&mut self, reason: String) {
        self.assert_admin();

        assert!(!reason.trim().is_empty(), "Recovery reason is required");

        let operation_id = self
            .pending_operation_id
            .expect("No pending operation");

        let started_height = self
            .pending_started_height
            .expect("Pending operation start height is missing");

        let minimum_height = started_height
            .checked_add(RECOVERY_DELAY_BLOCKS)
            .expect("Recovery height overflow");

        assert!(
            env::block_height() > minimum_height,
            "Pending operation recovery delay has not elapsed"
        );

        let old_operation = self.pending_operation.clone();
        let old_version = self.pending_operation_version.unwrap_or(0);

        self.pending_operation_id = None;
        self.pending_operation = None;
        self.pending_started_height = None;
        self.pending_operation_version = None;
        self.pending_initiator = None;

        self.last_operation_status = "ABORTED".to_string();
        self.last_operation_error = Some(reason.clone());

        self.last_config_sync_status =
            if self.confirmed_config_version == self.desired_config_version {
                "SYNCED".to_string()
            } else {
                "OUT_OF_SYNC".to_string()
            };

        self.log_event(
            "PENDING_OPERATION_ABORTED",
            env::predecessor_account_id(),
            json!({
                "operation_id": operation_id,
                "operation": old_operation,
                "operation_version": old_version,
                "reason": reason,
                "warning": "The original cross-contract promise was not cancelled"
            }),
        );
    }

    // ---------------------------------------------------------
    // Dispute recommendations
    // ---------------------------------------------------------

    pub fn set_dispute_recommendation(
        &mut self,
        escrow_id: String,
        recommendation: String,
    ) {
        self.assert_admin();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(
            !recommendation.trim().is_empty(),
            "Recommendation is required"
        );

        assert!(
            self.dispute_recommendations.get(&escrow_id).is_none(),
            "Recommendation already recorded"
        );

        self.dispute_recommendations
            .insert(escrow_id.clone(), recommendation.clone());

        self.log_event(
            "DISPUTE_RECOMMENDATION_RECORDED",
            env::predecessor_account_id(),
            json!({
                "escrow_id": escrow_id,
                "recommendation": recommendation
            }),
        );
    }

    pub fn update_dispute_recommendation(
        &mut self,
        escrow_id: String,
        recommendation: String,
    ) {
        self.assert_admin();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(!recommendation.trim().is_empty(), "Recommendation is required");

        assert!(
            self.dispute_recommendations.get(&escrow_id).is_some(),
            "No recommendation exists"
        );

        self.dispute_recommendations
            .insert(escrow_id.clone(), recommendation.clone());

        self.log_event(
            "DISPUTE_RECOMMENDATION_UPDATED",
            env::predecessor_account_id(),
            json!({
                "escrow_id": escrow_id,
                "recommendation": recommendation
            }),
        );
    }
}
