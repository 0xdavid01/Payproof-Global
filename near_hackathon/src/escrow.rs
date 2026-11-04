
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, AccountId, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;

const FT_TRANSFER_GAS: Gas = Gas::from_tgas(10);
const CALLBACK_GAS: Gas = Gas::from_tgas(20);

const MAX_REASON_LENGTH: usize = 500;
const MAX_TITLE_LENGTH: usize = 200;
const MAX_DESCRIPTION_LENGTH: usize = 5_000;
const MAX_EVIDENCE_LENGTH: usize = 10_000;
const MAX_ESCROW_ID_LENGTH: usize = 100;
const BASIS_POINTS: u128 = 10_000;

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
    );
}

#[ext_contract(ext_self)]
pub trait EscrowCallbacks {
    fn on_settlement_complete(
        &mut self,
        escrow_id: String,
        operation_id: u64,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    );

    fn on_fee_withdrawal_complete(
        &mut self,
        operation_id: u64,
        asset: Asset,
        amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    );
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum Asset {
    Near,
    Usdt,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum EscrowStatus {
    AwaitingFunding,
    Funded,
    WorkSubmitted,
    Disputed,
    Releasing,
    Refunding,
    SettlementFailed,
    Released,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Escrow {
    pub escrow_id: String,
    pub client: AccountId,
    pub freelancer: AccountId,
    pub asset: Asset,
    pub amount: u128,
    pub funded_amount: u128,
    pub platform_fee_bps: u32,
    pub platform_fee: u128,
    pub status: EscrowStatus,
    pub title: String,
    pub description: String,
    pub evidence: Option<String>,
    pub dispute_reason: Option<String>,
    pub frozen: bool,
    pub created_at: u64,
    pub updated_at: u64,
    pub config_version: u64,
    pub operation_version: u64,
    pub settlement_operation_id: Option<u64>,
    pub settlement_amount: u128,
    pub settlement_recipient: Option<AccountId>,
    pub settlement_is_refund: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PendingFeeWithdrawal {
    pub operation_id: u64,
    pub asset: Asset,
    pub amount: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    admin_contract: AccountId,
    treasury: Option<AccountId>,
    dispute_resolver: Option<AccountId>,
    usdt_contract: Option<AccountId>,

    platform_fee_bps: u32,
    config_version: u64,
    operation_version: u64,

    paused: bool,
    configured: bool,

    escrows: LookupMap<String, Escrow>,
    used_ids: LookupMap<String, bool>,

    operation_nonce: u64,

    accrued_near_fees: u128,
    accrued_usdt_fees: u128,

    pending_fee_withdrawal: Option<PendingFeeWithdrawal>,
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new(admin_contract: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");

        Self {
            admin_contract,
            treasury: None,
            dispute_resolver: None,
            usdt_contract: None,

            platform_fee_bps: 350,
            config_version: 0,
            operation_version: 0,

            paused: true,
            configured: false,

            escrows: LookupMap::new(b"escrows".to_vec()),
            used_ids: LookupMap::new(b"used_ids".to_vec()),

            operation_nonce: 0,

            accrued_near_fees: 0,
            accrued_usdt_fees: 0,

            pending_fee_withdrawal: None,
        }
    }

    // ---------------------------------------------------------
    // Authorization and validation
    // ---------------------------------------------------------

    fn assert_admin_contract(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.admin_contract,
            "Only the Admin Contract can perform this action"
        );
    }

    fn assert_resolver(&self) {
        assert_eq!(
            Some(env::predecessor_account_id()),
            self.dispute_resolver,
            "Only the dispute resolver can perform this action"
        );
    }

    fn assert_configured(&self) {
        assert!(self.configured, "Configuration is not synchronized");
    }

    fn assert_not_paused(&self) {
        self.assert_configured();
        assert!(!self.paused, "Platform is paused");
    }

    fn assert_reason(reason: &str) {
        assert!(!reason.trim().is_empty(), "Reason is required");
        assert!(reason.len() <= MAX_REASON_LENGTH, "Reason is too long");
    }

    fn load_escrow(&self, escrow_id: &str) -> Escrow {
        self.escrows
            .get(&escrow_id.to_string())
            .cloned()
            .expect("Escrow does not exist")
    }

    fn save_escrow(&mut self, mut escrow: Escrow) {
        escrow.updated_at = env::block_timestamp();
        self.escrows.insert(escrow.escrow_id.clone(), escrow);
    }

    fn next_operation_id(&mut self) -> u64 {
        self.operation_nonce = self
            .operation_nonce
            .checked_add(1)
            .expect("Operation ID overflow");

        self.operation_nonce
    }

    fn log_event(&self, event_name: &str, data: Value) {
        let event = json!({
            "standard": "payproof_escrow",
            "version": "1.0.0",
            "event": event_name,
            "data": [{
                "contract": env::current_account_id(),
                "timestamp_ns": env::block_timestamp(),
                "config_version": self.config_version,
                "operation_version": self.operation_version,
                "details": data
            }]
        });

        env::log_str(&format!("EVENT_JSON:{}", event));
    }

    fn fee_for(&self, amount: u128, fee_bps: u32) -> u128 {
        let fee_bps = fee_bps as u128;

        let whole = (amount / BASIS_POINTS)
            .checked_mul(fee_bps)
            .expect("Fee calculation overflow");

        let remainder = ((amount % BASIS_POINTS) * fee_bps) / BASIS_POINTS;

        whole
            .checked_add(remainder)
            .expect("Fee calculation overflow")
    }

    fn token_contract(&self) -> AccountId {
        self.usdt_contract
            .clone()
            .expect("USDT contract is not configured")
    }

    fn treasury_account(&self) -> AccountId {
        self.treasury
            .clone()
            .expect("Treasury is not configured")
    }

    // ---------------------------------------------------------
    // Admin configuration
    // ---------------------------------------------------------

    pub fn update_platform_config(
        &mut self,
        treasury: AccountId,
        dispute_resolver: AccountId,
        usdt_contract: AccountId,
        platform_fee_bps: u32,
        config_version: u64,
        operation_version: u64,
    ) {
        self.assert_admin_contract();

        assert!(
            config_version >= self.config_version,
            "Stale configuration version"
        );

        assert!(
            operation_version > self.operation_version,
            "Stale operation version"
        );

        assert!(
            platform_fee_bps <= 1_000,
            "Platform fee cannot exceed 10%"
        );

        assert_ne!(
            treasury,
            env::current_account_id(),
            "Treasury cannot be the escrow contract"
        );

        assert_ne!(
            dispute_resolver,
            env::current_account_id(),
            "Resolver cannot be the escrow contract"
        );

        assert_ne!(
            usdt_contract,
            env::current_account_id(),
            "USDT contract cannot be the escrow contract"
        );

        self.treasury = Some(treasury.clone());
        self.dispute_resolver = Some(dispute_resolver.clone());
        self.usdt_contract = Some(usdt_contract.clone());

        self.platform_fee_bps = platform_fee_bps;
        self.config_version = config_version;
        self.operation_version = operation_version;

        let first_configuration = !self.configured;
        self.configured = true;

        if first_configuration {
            self.paused = true;
        }

        self.log_event(
            "PLATFORM_CONFIGURATION_UPDATED",
            json!({
                "config_version": config_version,
                "operation_version": operation_version,
                "platform_fee_bps": platform_fee_bps,
                "treasury": treasury,
                "dispute_resolver": dispute_resolver,
                "usdt_contract": usdt_contract,
                "paused": self.paused
            }),
        );
    }

    pub fn set_platform_paused(
        &mut self,
        paused: bool,
        operation_version: u64,
    ) {
        self.assert_admin_contract();
        self.assert_configured();

        assert!(
            operation_version > self.operation_version,
            "Stale operation version"
        );

        self.operation_version = operation_version;
        self.paused = paused;

        self.log_event(
            "PLATFORM_PAUSE_UPDATED",
            json!({
                "paused": paused,
                "operation_version": operation_version
            }),
        );
    }

    // ---------------------------------------------------------
    // Create escrow
    // ---------------------------------------------------------

    #[payable]
    pub fn create_escrow(
        &mut self,
        escrow_id: String,
        freelancer: AccountId,
        asset: Asset,
        amount: U128,
        title: String,
        description: String,
    ) {
        self.assert_not_paused();
        assert_one_yocto();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(
            escrow_id.len() <= MAX_ESCROW_ID_LENGTH,
            "Escrow ID is too long"
        );

        assert!(
            self.used_ids.get(&escrow_id).is_none(),
            "Escrow ID has already been used"
        );

        let client = env::predecessor_account_id();

        assert_ne!(
            freelancer,
            client,
            "Client and freelancer must be different"
        );

        assert!(amount.0 > 0, "Amount must be greater than zero");
        assert!(!title.trim().is_empty(), "Title is required");
        assert!(title.len() <= MAX_TITLE_LENGTH, "Title is too long");
        assert!(
            description.len() <= MAX_DESCRIPTION_LENGTH,
            "Description is too long"
        );

        self.used_ids.insert(escrow_id.clone(), true);

        let escrow = Escrow {
            escrow_id: escrow_id.clone(),
            client: client.clone(),
            freelancer,
            asset,
            amount: amount.0,
            funded_amount: 0,
            platform_fee_bps: self.platform_fee_bps,
            platform_fee: 0,
            status: EscrowStatus::AwaitingFunding,
            title,
            description,
            evidence: None,
            dispute_reason: None,
            frozen: false,
            created_at: env::block_timestamp(),
            updated_at: env::block_timestamp(),
            config_version: self.config_version,
            operation_version: self.operation_version,
            settlement_operation_id: None,
            settlement_amount: 0,
            settlement_recipient: None,
            settlement_is_refund: false,
        };

        self.escrows.insert(escrow_id.clone(), escrow);

        let saved_escrow = self.load_escrow(&escrow_id);

        self.log_event(
            "ESCROW_CREATED",
            json!({
                "escrow_id": escrow_id,
                "client": client,
                "freelancer": saved_escrow.freelancer,
                "asset": saved_escrow.asset,
                "amount": amount.0.to_string(),
                "platform_fee_bps": self.platform_fee_bps,
                "config_version": self.config_version
            }),
        );
    }

    // ---------------------------------------------------------
    // Native NEAR funding
    // ---------------------------------------------------------

    #[payable]
    pub fn fund_with_near(&mut self, escrow_id: String) {
        self.assert_not_paused();

        let mut escrow = self.load_escrow(&escrow_id);

        assert_eq!(
            env::predecessor_account_id(),
            escrow.client,
            "Only the client can fund this escrow"
        );

        assert_eq!(escrow.asset, Asset::Near, "Escrow does not accept NEAR");
        assert!(!escrow.frozen, "Escrow is frozen");

        assert_eq!(
            escrow.status,
            EscrowStatus::AwaitingFunding,
            "Escrow cannot be funded in this state"
        );

        let deposit = env::attached_deposit().as_yoctonear();

        assert_eq!(
            deposit,
            escrow.amount,
            "Deposit must exactly match the escrow amount"
        );

        escrow.funded_amount = deposit;
        escrow.status = EscrowStatus::Funded;

        self.save_escrow(escrow);

        self.log_event(
            "ESCROW_FUNDED",
            json!({
                "escrow_id": escrow_id,
                "asset": "NEAR",
                "amount": deposit.to_string()
            }),
        );
    }

    // ---------------------------------------------------------
    // USDT NEP-141 funding
    // ---------------------------------------------------------

    #[payable]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if !self.configured || self.paused {
            return PromiseOrValue::Value(amount);
        }

        let token_contract = env::predecessor_account_id();

        if Some(token_contract) != self.usdt_contract {
            return PromiseOrValue::Value(amount);
        }

        let parsed: Value = match near_sdk::serde_json::from_str(&msg) {
            Ok(value) => value,
            Err(_) => return PromiseOrValue::Value(amount),
        };

        let escrow_id = match parsed.get("escrow_id").and_then(Value::as_str) {
            Some(value) => value.to_string(),
            None => return PromiseOrValue::Value(amount),
        };

        let mut escrow = match self.escrows.get(&escrow_id).cloned() {
            Some(value) => value,
            None => return PromiseOrValue::Value(amount),
        };

        if escrow.asset != Asset::Usdt
            || escrow.client != sender_id
            || escrow.status != EscrowStatus::AwaitingFunding
            || escrow.frozen
            || amount.0 != escrow.amount
        {
            return PromiseOrValue::Value(amount);
        }

        escrow.funded_amount = amount.0;
        escrow.status = EscrowStatus::Funded;

        self.save_escrow(escrow);

        self.log_event(
            "ESCROW_FUNDED",
            json!({
                "escrow_id": escrow_id,
                "asset": "USDT",
                "amount": amount.0.to_string(),
                "client": sender_id
            }),
        );

        PromiseOrValue::Value(U128(0))
    }

    // ---------------------------------------------------------
    // Work submission
    // ---------------------------------------------------------

    pub fn submit_work(&mut self, escrow_id: String, evidence: String) {
        self.assert_not_paused();

        assert!(!evidence.trim().is_empty(), "Evidence is required");
        assert!(
            evidence.len() <= MAX_EVIDENCE_LENGTH,
            "Evidence reference is too long"
        );

        let mut escrow = self.load_escrow(&escrow_id);

        assert_eq!(
            env::predecessor_account_id(),
            escrow.freelancer,
            "Only the freelancer can submit work"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        assert_eq!(
            escrow.status,
            EscrowStatus::Funded,
            "Escrow must be funded before work submission"
        );

        escrow.evidence = Some(evidence);
        escrow.status = EscrowStatus::WorkSubmitted;

        self.save_escrow(escrow);

        self.log_event(
            "WORK_SUBMITTED",
            json!({
                "escrow_id": escrow_id,
                "freelancer": env::predecessor_account_id()
            }),
        );
    }

    // ---------------------------------------------------------
    // Client approval
    // ---------------------------------------------------------

    #[payable]
    pub fn approve_work(&mut self, escrow_id: String) -> Promise {
        assert_one_yocto();
        self.assert_not_paused();

        let escrow = self.load_escrow(&escrow_id);

        assert_eq!(
            env::predecessor_account_id(),
            escrow.client,
            "Only the client can approve work"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        assert_eq!(
            escrow.status,
            EscrowStatus::WorkSubmitted,
            "Work has not been submitted"
        );

        self.start_release(escrow)
    }

    // ---------------------------------------------------------
    // Settlement initiation
    // ---------------------------------------------------------

    fn start_release(&mut self, mut escrow: Escrow) -> Promise {
        let fee = self.fee_for(
            escrow.funded_amount,
            escrow.platform_fee_bps,
        );

        let payout = escrow
            .funded_amount
            .checked_sub(fee)
            .expect("Payout calculation overflow");

        let operation_id = self.next_operation_id();

        escrow.status = EscrowStatus::Releasing;
        escrow.platform_fee = fee;
        escrow.settlement_operation_id = Some(operation_id);
        escrow.settlement_amount = payout;
        escrow.settlement_recipient = Some(escrow.freelancer.clone());
        escrow.settlement_is_refund = false;

        self.save_escrow(escrow.clone());

        self.log_event(
            "RELEASE_INITIATED",
            json!({
                "escrow_id": escrow.escrow_id,
                "operation_id": operation_id,
                "gross_amount": escrow.funded_amount.to_string(),
                "fee": fee.to_string(),
                "payout": payout.to_string(),
                "fee_bps": escrow.platform_fee_bps
            }),
        );

        self.transfer_and_callback(
            escrow.escrow_id,
            operation_id,
            escrow.asset,
            escrow.freelancer,
            payout,
        )
    }

    fn start_refund(
        &mut self,
        mut escrow: Escrow,
        reason: String,
    ) -> Promise {
        let operation_id = self.next_operation_id();

        escrow.status = EscrowStatus::Refunding;
        escrow.settlement_operation_id = Some(operation_id);
        escrow.settlement_amount = escrow.funded_amount;
        escrow.settlement_recipient = Some(escrow.client.clone());
        escrow.settlement_is_refund = true;
        escrow.dispute_reason = Some(reason.clone());

        self.save_escrow(escrow.clone());

        self.log_event(
            "REFUND_INITIATED",
            json!({
                "escrow_id": escrow.escrow_id,
                "operation_id": operation_id,
                "client": escrow.client,
                "amount": escrow.funded_amount.to_string(),
                "reason": reason
            }),
        );

        self.transfer_and_callback(
            escrow.escrow_id,
            operation_id,
            escrow.asset,
            escrow.client,
            escrow.funded_amount,
        )
    }

    fn transfer_and_callback(
        &self,
        escrow_id: String,
        operation_id: u64,
        asset: Asset,
        recipient: AccountId,
        amount: u128,
    ) -> Promise {
        let transfer = match asset {
            Asset::Near => Promise::new(recipient)
                .transfer(NearToken::from_yoctonear(amount)),
            Asset::Usdt => {
                ext_ft::ext(self.token_contract())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(FT_TRANSFER_GAS)
                    .ft_transfer(
                        recipient,
                        U128(amount),
                        Some(format!("PayProof escrow {}", escrow_id)),
                    )
            }
        };

        transfer.then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_settlement_complete(escrow_id, operation_id),
        )
    }

    #[private]
    pub fn on_settlement_complete(
        &mut self,
        escrow_id: String,
        operation_id: u64,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) {
        let mut escrow = match self.escrows.get(&escrow_id).cloned() {
            Some(value) => value,
            None => {
                env::log_str("Settlement callback: escrow not found");
                return;
            }
        };

        if escrow.settlement_operation_id != Some(operation_id) {
            env::log_str("Settlement callback ignored: stale operation");
            return;
        }

        let is_refund = escrow.settlement_is_refund;

        match result {
            Ok(()) => {
                if is_refund {
                    escrow.status = EscrowStatus::Refunded;
                } else {
                    escrow.status = EscrowStatus::Released;

                    match escrow.asset {
                        Asset::Near => {
                            self.accrued_near_fees = self
                                .accrued_near_fees
                                .checked_add(escrow.platform_fee)
                                .expect("NEAR fee accounting overflow");
                        }
                        Asset::Usdt => {
                            self.accrued_usdt_fees = self
                                .accrued_usdt_fees
                                .checked_add(escrow.platform_fee)
                                .expect("USDT fee accounting overflow");
                        }
                    }
                }

                self.log_event(
                    if is_refund {
                        "REFUND_COMPLETED"
                    } else {
                        "RELEASE_COMPLETED"
                    },
                    json!({
                        "escrow_id": escrow_id,
                        "operation_id": operation_id,
                        "amount": escrow.settlement_amount.to_string(),
                        "recipient": escrow.settlement_recipient,
                        "fee": if is_refund {
                            "0".to_string()
                        } else {
                            escrow.platform_fee.to_string()
                        }
                    }),
                );
            }
            Err(error) => {
                escrow.status = EscrowStatus::SettlementFailed;

                self.log_event(
                    "SETTLEMENT_FAILED",
                    json!({
                        "escrow_id": escrow_id,
                        "operation_id": operation_id,
                        "is_refund": is_refund,
                        "amount": escrow.settlement_amount.to_string(),
                        "error": format!("{:?}", error)
                    }),
                );
            }
        }

        escrow.settlement_operation_id = None;
        self.save_escrow(escrow);
    }

    // ---------------------------------------------------------
    // Retry failed settlement
    // ---------------------------------------------------------

    #[payable]
    pub fn retry_failed_settlement(
        &mut self,
        escrow_id: String,
    ) -> Promise {
        assert_one_yocto();
        self.assert_not_paused();

        let mut escrow = self.load_escrow(&escrow_id);

        assert!(
            escrow.status == EscrowStatus::SettlementFailed,
            "Settlement has not failed"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        let recipient = escrow
            .settlement_recipient
            .clone()
            .expect("Settlement recipient is missing");

        let amount = escrow.settlement_amount;
        let is_refund = escrow.settlement_is_refund;

        if is_refund {
            assert_eq!(
                env::predecessor_account_id(),
                escrow.client,
                "Only the client can retry this refund"
            );
        } else {
            assert!(
                env::predecessor_account_id() == escrow.client
                    || env::predecessor_account_id() == escrow.freelancer,
                "Only the escrow parties can retry settlement"
            );
        }

        let operation_id = self.next_operation_id();

        escrow.status = if is_refund {
            EscrowStatus::Refunding
        } else {
            EscrowStatus::Releasing
        };

        escrow.settlement_operation_id = Some(operation_id);

        self.save_escrow(escrow.clone());

        self.log_event(
            "SETTLEMENT_RETRY_INITIATED",
            json!({
                "escrow_id": escrow_id,
                "operation_id": operation_id,
                "is_refund": is_refund,
                "amount": amount.to_string()
            }),
        );

        self.transfer_and_callback(
            escrow_id,
            operation_id,
            escrow.asset,
            recipient,
            amount,
        )
    }

    // ---------------------------------------------------------
    // Refund request
    // ---------------------------------------------------------

    #[payable]
    pub fn request_refund(
        &mut self,
        escrow_id: String,
        reason: String,
    ) {
        assert_one_yocto();
        self.assert_not_paused();

        Self::assert_reason(&reason);

        let mut escrow = self.load_escrow(&escrow_id);

        assert_eq!(
            env::predecessor_account_id(),
            escrow.client,
            "Only the client can request a refund"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        assert!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::WorkSubmitted,
            "Refund is unavailable in this state"
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason = Some(reason.clone());

        self.save_escrow(escrow);

        self.log_event(
            "REFUND_REQUESTED",
            json!({
                "escrow_id": escrow_id,
                "reason": reason
            }),
        );
    }

    // ---------------------------------------------------------
    // Disputes
    // ---------------------------------------------------------

    #[payable]
    pub fn raise_dispute(
        &mut self,
        escrow_id: String,
        reason: String,
    ) {
        assert_one_yocto();
        self.assert_not_paused();

        Self::assert_reason(&reason);

        let mut escrow = self.load_escrow(&escrow_id);
        let caller = env::predecessor_account_id();

        assert!(
            caller == escrow.client || caller == escrow.freelancer,
            "Only the client or freelancer can raise a dispute"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        assert!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::WorkSubmitted,
            "Dispute cannot be raised in this state"
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason = Some(reason.clone());

        self.save_escrow(escrow);

        self.log_event(
            "DISPUTE_RAISED",
            json!({
                "escrow_id": escrow_id,
                "raised_by": caller,
                "reason": reason
            }),
        );
    }

    #[payable]
    pub fn resolve_dispute(
        &mut self,
        escrow_id: String,
        release_to_freelancer: bool,
        reason: String,
    ) -> Promise {
        assert_one_yocto();
        self.assert_resolver();

        Self::assert_reason(&reason);

        let escrow = self.load_escrow(&escrow_id);

        assert_eq!(
            escrow.status,
            EscrowStatus::Disputed,
            "Escrow is not disputed"
        );

        assert!(!escrow.frozen, "Escrow is frozen");

        if release_to_freelancer {
            self.start_release(escrow)
        } else {
            self.start_refund(escrow, reason)
        }
    }

    // ---------------------------------------------------------
    // Admin freeze and unfreeze
    // ---------------------------------------------------------

    pub fn freeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
        config_version: u64,
        operation_version: u64,
    ) {
        self.assert_admin_contract();

        assert_eq!(
            config_version,
            self.config_version,
            "Configuration version mismatch"
        );

        assert!(
            operation_version > self.operation_version,
            "Stale operation version"
        );

        Self::assert_reason(&reason);

        let mut escrow = self.load_escrow(&escrow_id);

        assert!(!escrow.frozen, "Escrow is already frozen");

        escrow.frozen = true;

        self.operation_version = operation_version;
        self.save_escrow(escrow);

        self.log_event(
            "ESCROW_FROZEN",
            json!({
                "escrow_id": escrow_id,
                "reason": reason,
                "operation_version": operation_version
            }),
        );
    }

    pub fn unfreeze_escrow(
        &mut self,
        escrow_id: String,
        reason: String,
        config_version: u64,
        operation_version: u64,
    ) {
        self.assert_admin_contract();

        assert_eq!(
            config_version,
            self.config_version,
            "Configuration version mismatch"
        );

        assert!(
            operation_version > self.operation_version,
            "Stale operation version"
        );

        Self::assert_reason(&reason);

        let mut escrow = self.load_escrow(&escrow_id);

        assert!(escrow.frozen, "Escrow is not frozen");

        escrow.frozen = false;

        self.operation_version = operation_version;
        self.save_escrow(escrow);

        self.log_event(
            "ESCROW_UNFROZEN",
            json!({
                "escrow_id": escrow_id,
                "reason": reason,
                "operation_version": operation_version
            }),
        );
    }

    // ---------------------------------------------------------
    // Platform fee withdrawal
    // ---------------------------------------------------------

    #[payable]
    pub fn withdraw_platform_fees(
        &mut self,
        asset: Asset,
        amount: U128,
    ) -> Promise {
        assert_one_yocto();
        self.assert_admin_contract();
        self.assert_configured();

        assert!(
            self.pending_fee_withdrawal.is_none(),
            "A fee withdrawal is already pending"
        );

        assert!(amount.0 > 0, "Withdrawal amount must be positive");

        let treasury = self.treasury_account();

        match asset {
            Asset::Near => {
                assert!(
                    amount.0 <= self.accrued_near_fees,
                    "Insufficient accrued NEAR fees"
                );
                self.accrued_near_fees -= amount.0;
            }
            Asset::Usdt => {
                assert!(
                    amount.0 <= self.accrued_usdt_fees,
                    "Insufficient accrued USDT fees"
                );
                self.accrued_usdt_fees -= amount.0;
            }
        }

        let operation_id = self.next_operation_id();

        self.pending_fee_withdrawal = Some(PendingFeeWithdrawal {
            operation_id,
            asset: asset.clone(),
            amount: amount.0,
        });

        self.log_event(
            "PLATFORM_FEE_WITHDRAWAL_INITIATED",
            json!({
                "operation_id": operation_id,
                "asset": asset,
                "amount": amount.0.to_string(),
                "treasury": treasury
            }),
        );

        let transfer = match asset {
            Asset::Near => Promise::new(treasury)
                .transfer(NearToken::from_yoctonear(amount.0)),
            Asset::Usdt => ext_ft::ext(self.token_contract())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(FT_TRANSFER_GAS)
                .ft_transfer(
                    treasury,
                    amount,
                    Some("PayProof platform fees".to_string()),
                ),
        };

        transfer.then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_fee_withdrawal_complete(
                    operation_id,
                    asset,
                    amount,
                ),
        )
    }

    // ---------------------------------------------------------
    // Fee withdrawal callback
    // ---------------------------------------------------------

    #[private]
    pub fn on_fee_withdrawal_complete(
        &mut self,
        operation_id: u64,
        asset: Asset,
        amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) {
        let pending = match self.pending_fee_withdrawal.clone() {
            Some(value) => value,
            None => {
                env::log_str("Fee callback ignored: no pending withdrawal");
                return;
            }
        };

        if pending.operation_id != operation_id
            || pending.asset != asset
            || pending.amount != amount.0
        {
            env::log_str("Fee callback ignored: pending withdrawal mismatch");
            return;
        }

        self.pending_fee_withdrawal = None;

        match result {
            Ok(()) => {
                self.log_event(
                    "PLATFORM_FEE_WITHDRAWAL_COMPLETED",
                    json!({
                        "operation_id": operation_id,
                        "asset": asset,
                        "amount": amount.0.to_string()
                    }),
                );
            }
            Err(error) => {
                match asset {
                    Asset::Near => {
                        self.accrued_near_fees = self
                            .accrued_near_fees
                            .checked_add(amount.0)
                            .expect("NEAR fee restoration overflow");
                    }
                    Asset::Usdt => {
                        self.accrued_usdt_fees = self
                            .accrued_usdt_fees
                            .checked_add(amount.0)
                            .expect("USDT fee restoration overflow");
                    }
                }

                self.log_event(
                    "PLATFORM_FEE_WITHDRAWAL_FAILED",
                    json!({
                        "operation_id": operation_id,
                        "asset": asset,
                        "amount": amount.0.to_string(),
                        "error": format!("{:?}", error)
                    }),
                );
            }
        }
    }

    // ---------------------------------------------------------
    // Views
    // ---------------------------------------------------------

    pub fn get_escrow(&self, escrow_id: String) -> Option<Escrow> {
        self.escrows.get(&escrow_id).cloned()
    }

    pub fn get_platform_configuration(&self) -> Value {
        json!({
            "admin_contract": self.admin_contract,
            "treasury": self.treasury,
            "dispute_resolver": self.dispute_resolver,
            "usdt_contract": self.usdt_contract,
            "platform_fee_bps": self.platform_fee_bps,
            "config_version": self.config_version,
            "operation_version": self.operation_version,
            "paused": self.paused,
            "configured": self.configured
        })
    }

    pub fn get_accrued_fees(&self) -> Value {
        json!({
            "near": self.accrued_near_fees.to_string(),
            "usdt": self.accrued_usdt_fees.to_string(),
            "pending_withdrawal": self.pending_fee_withdrawal.is_some()
        })
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_config_version(&self) -> u64 {
        self.config_version
    }

    pub fn get_operation_version(&self) -> u64 {
        self.operation_version
    }
}
