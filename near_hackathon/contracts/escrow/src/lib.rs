use near_sdk::{
    assert_one_yocto, env, ext_contract, near, AccountId, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
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
    Usdc,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum EscrowStatus {
    /// Kept for backward compatibility with existing records and
    /// serialized JSON. Never persisted by the atomic creation
    /// flow — every newly created escrow is stored as `Funded`.
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
    /// Gross job amount payable to the freelancer, excluding the
    /// platform fee paid by the client.
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

/// Message payload expected by `ft_on_transfer` when the client
/// calls `ft_transfer_call` on the USDT or USDC contract to create
/// and fund an escrow atomically.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CreateAndFundFtMessage {
    pub escrow_id: String,
    pub freelancer: AccountId,
    pub amount: U128,
    pub title: String,
    pub description: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    admin_contract: AccountId,
    treasury: Option<AccountId>,
    dispute_resolver: Option<AccountId>,

    usdt_contract: Option<AccountId>,
    usdc_contract: Option<AccountId>,

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
    accrued_usdc_fees: u128,

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
            usdc_contract: None,

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
            accrued_usdc_fees: 0,

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
        assert!(self.treasury.is_some(), "Treasury is not configured");
        assert!(
            self.dispute_resolver.is_some(),
            "Dispute resolver is not configured"
        );
        assert!(
            self.usdt_contract.is_some(),
            "USDT contract is not configured"
        );
        assert!(
            self.usdc_contract.is_some(),
            "USDC contract is not configured"
        );
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

    fn token_contract_for(&self, asset: &Asset) -> AccountId {
        match asset {
            Asset::Near => env::panic_str("NEAR does not use a token contract"),
            Asset::Usdt => self
                .usdt_contract
                .clone()
                .expect("USDT contract is not configured"),
            Asset::Usdc => self
                .usdc_contract
                .clone()
                .expect("USDC contract is not configured"),
        }
    }

    fn treasury_account(&self) -> AccountId {
        self.treasury
            .clone()
            .expect("Treasury is not configured")
    }

    /// Common validation for both atomic funding paths.
    /// Returns the canonical client account, or panics.
    fn validate_create_and_fund(
        &self,
        escrow_id: &str,
        freelancer: &AccountId,
        amount: u128,
        title: &str,
        description: &str,
        client: AccountId,
    ) {
        self.assert_not_paused();

        assert!(!escrow_id.trim().is_empty(), "Escrow ID is required");
        assert!(
            escrow_id.len() <= MAX_ESCROW_ID_LENGTH,
            "Escrow ID is too long"
        );

        assert!(
            self.used_ids.get(&escrow_id.to_string()).is_none(),
            "Escrow ID has already been used"
        );

        assert_ne!(
            freelancer, &client,
            "Client and freelancer must be different"
        );

        assert!(amount > 0, "Amount must be greater than zero");
        assert!(!title.trim().is_empty(), "Title is required");
        assert!(title.len() <= MAX_TITLE_LENGTH, "Title is too long");
        assert!(
            description.len() <= MAX_DESCRIPTION_LENGTH,
            "Description is too long"
        );

        assert!(
            self.platform_fee_bps <= 1_000,
            "Platform fee cannot exceed 10%"
        );
    }

    /// Builds and stores a `Funded` escrow. Caller must have already
    /// validated everything and (for FT paths) confirmed the funds
    /// were received by this contract's execution.
    fn persist_funded_escrow(
        &mut self,
        escrow_id: String,
        client: AccountId,
        freelancer: AccountId,
        asset: Asset,
        amount: u128,
        title: String,
        description: String,
    ) {
        // Mark used before storing to block any duplicate ID race
        // within the same execution (defensive — not reachable via
        // re-entrancy, since ft_on_transfer makes no outgoing calls).
        self.used_ids.insert(escrow_id.clone(), true);

        let escrow = Escrow {
            escrow_id: escrow_id.clone(),
            client: client.clone(),
            freelancer: freelancer.clone(),
            asset: asset.clone(),
            amount,
            funded_amount: amount
                .checked_add(self.fee_for(amount, self.platform_fee_bps))
                .expect("Funding amount overflow"),
            platform_fee_bps: self.platform_fee_bps,
            platform_fee: self.fee_for(amount, self.platform_fee_bps),
            status: EscrowStatus::Funded,
            title: title.clone(),
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

        self.log_event(
            "ESCROW_CREATED",
            json!({
                "escrow_id": escrow_id,
                "client": client,
                "freelancer": freelancer,
                "asset": asset,
                "amount": amount.to_string(),
                "platform_fee_bps": self.platform_fee_bps,
                "config_version": self.config_version
            }),
        );
    }

    // ---------------------------------------------------------
    // Admin configuration
    // ---------------------------------------------------------

    pub fn update_platform_config(
        &mut self,
        treasury: AccountId,
        dispute_resolver: AccountId,
        usdt_contract: AccountId,
        usdc_contract: AccountId,
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

        assert_ne!(
            usdc_contract,
            env::current_account_id(),
            "USDC contract cannot be the escrow contract"
        );

        assert_ne!(
            usdt_contract, usdc_contract,
            "USDT and USDC must use different token contracts"
        );

        assert_ne!(
            treasury, usdt_contract,
            "Treasury cannot equal the USDT contract"
        );

        assert_ne!(
            treasury, usdc_contract,
            "Treasury cannot equal the USDC contract"
        );

        self.treasury = Some(treasury.clone());
        self.dispute_resolver = Some(dispute_resolver.clone());

        self.usdt_contract = Some(usdt_contract.clone());
        self.usdc_contract = Some(usdc_contract.clone());

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
                "usdc_contract": usdc_contract,
                "paused": self.paused
            }),
        );
    }

    pub fn set_platform_paused(&mut self, paused: bool, operation_version: u64) {
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
    // Atomic Create & Fund — NEAR
    // ---------------------------------------------------------

    /// Creates and funds a NEAR escrow in a single payable call.
    ///
    /// `amount` is the freelancer's gross project amount. The attached
    /// deposit must include the platform fee in addition to that amount.
    #[payable]
    pub fn create_and_fund_with_near(
        &mut self,
        escrow_id: String,
        freelancer: AccountId,
        amount: U128,
        title: String,
        description: String,
    ) {
        let client = env::predecessor_account_id();

        self.validate_create_and_fund(
            &escrow_id,
            &freelancer,
            amount.0,
            &title,
            &description,
            client.clone(),
        );

        let fee = self.fee_for(amount.0, self.platform_fee_bps);
        let expected_deposit = amount
            .0
            .checked_add(fee)
            .expect("Funding amount overflow");
        let deposit = env::attached_deposit().as_yoctonear();
        assert_eq!(
            deposit, expected_deposit,
            "Deposit must include the platform fee"
        );

        self.persist_funded_escrow(
            escrow_id.clone(),
            client.clone(),
            freelancer.clone(),
            Asset::Near,
            amount.0,
            title,
            description,
        );

        self.log_event(
            "ESCROW_FUNDED",
            json!({
                "escrow_id": escrow_id,
                "asset": "NEAR",
                "amount": amount.0.to_string(),
                "funded_amount": deposit.to_string(),
                "platform_fee": fee.to_string(),
                "client": client,
                "freelancer": freelancer
            }),
        );
    }

    // ---------------------------------------------------------
    // Atomic Create & Fund — USDT / USDC (NEP-141)
    // ---------------------------------------------------------

    /// `ft_on_transfer` entry point. The client calls
    /// `ft_transfer_call` on the configured USDT/USDC contract with
    /// `msg = {"escrow_id": "...", "freelancer": "...", "amount":
    /// "<gross project amount in raw units>", "title": "...",
    /// "description": "..."}`. The transferred amount must include
    /// the platform fee in addition to the message amount.
    ///
    /// Atomicity:
    /// - If any validation fails, the whole `amount` is returned,
    ///   which triggers a rollback of the token transfer in the
    ///   token contract. No escrow record is written here.
    /// - If every validation passes, the escrow is written in this
    ///   same execution, and `U128(0)` is returned. Because no
    ///   outgoing promise is created between the escrow write and
    ///   this return, there is no window in which the transfer could
    ///   be rolled back while the escrow record remains.
    #[payable]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        // If not configured or paused, refuse the funds entirely.
        if !self.configured || self.paused {
            return PromiseOrValue::Value(amount);
        }

        let token_contract = env::predecessor_account_id();

        let asset = if Some(token_contract.clone()) == self.usdt_contract {
            Asset::Usdt
        } else if Some(token_contract.clone()) == self.usdc_contract {
            Asset::Usdc
        } else {
            // Unsupported token contract — refund.
            return PromiseOrValue::Value(amount);
        };

        // The client is the NEP-141 sender, not the token contract.
        let client = sender_id.clone();

        // Decode the create-and-fund message.
        let parsed: CreateAndFundFtMessage = match near_sdk::serde_json::from_str(&msg) {
            Ok(value) => value,
            Err(_) => return PromiseOrValue::Value(amount),
        };

        // The message amount is the freelancer's project amount; the
        // actual token transfer must also include the platform fee.
        if !self.configured || self.paused {
            return PromiseOrValue::Value(amount);
        }

        // Run the shared validations in a way that turns panics into
        // refunds. We pre-check all guard conditions to keep this
        // function total (never panics on bad input), because any
        // panic here would abort the whole execution *after* the
        // tokens have already left the client — the token contract
        // would then have to refund via `ft_resolve_transfer`, which
        // is supported by our stub but not by every FT. Refunding
        // explicitly from `ft_on_transfer` is the safest behavior.
        let expected_funding = parsed
            .amount
            .0
            .checked_add(self.fee_for(parsed.amount.0, self.platform_fee_bps));
        let guard_ok = !parsed.escrow_id.trim().is_empty()
            && parsed.escrow_id.len() <= MAX_ESCROW_ID_LENGTH
            && self.used_ids.get(&parsed.escrow_id).is_none()
            && parsed.freelancer != client
            && parsed.amount.0 > 0
            && expected_funding == Some(amount.0)
            && !parsed.title.trim().is_empty()
            && parsed.title.len() <= MAX_TITLE_LENGTH
            && parsed.description.len() <= MAX_DESCRIPTION_LENGTH
            && self.platform_fee_bps <= 1_000;

        if !guard_ok {
            return PromiseOrValue::Value(amount);
        }

        // Cross-check asset consistency: the token contract we were
        // called from must match the configured contract for that
        // asset. Already implied by the `asset` resolution above,
        // but re-assert against `token_contract_for` for defence.
        let expected_contract = self.token_contract_for(&asset);
        if expected_contract != token_contract {
            return PromiseOrValue::Value(amount);
        }

        // All validations passed — persist the funded escrow.
        // If any future change makes this path able to fail *after*
        // persisting, the `used_ids` insert below would still fire
        // first and leave the ID burned on a rollback. Because there
        // is no outgoing promise and no fallible code between the
        // insert and the end of this function, that cannot happen
        // today, but this is the invariant to preserve.
        self.persist_funded_escrow(
            parsed.escrow_id.clone(),
            client.clone(),
            parsed.freelancer.clone(),
            asset.clone(),
            parsed.amount.0,
            parsed.title.clone(),
            parsed.description.clone(),
        );

        let asset_name = match asset {
            Asset::Usdt => "USDT",
            Asset::Usdc => "USDC",
            Asset::Near => unreachable!(),
        };

        self.log_event(
            "ESCROW_FUNDED",
            json!({
                "escrow_id": parsed.escrow_id,
                "asset": asset_name,
                "amount": parsed.amount.0.to_string(),
                "funded_amount": amount.0.to_string(),
                "platform_fee": self.fee_for(parsed.amount.0, self.platform_fee_bps).to_string(),
                "client": client,
                "freelancer": parsed.freelancer,
                "token_contract": token_contract
            }),
        );

        // Unused amount = 0 → transfer is committed.
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
        // Escrows funded before client-paid fees were introduced have no
        // stored funding fee; keep their original net-payout behavior.
        let (fee, payout) = if escrow.platform_fee > 0 {
            (escrow.platform_fee, escrow.amount)
        } else {
            let fee = self.fee_for(escrow.funded_amount, escrow.platform_fee_bps);
            let payout = escrow
                .funded_amount
                .checked_sub(fee)
                .expect("Payout calculation overflow");
            (fee, payout)
        };

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
                "gross_amount": escrow.amount.to_string(),
                "funded_amount": escrow.funded_amount.to_string(),
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

    fn start_refund(&mut self, mut escrow: Escrow, reason: String) -> Promise {
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
        let transfer = match &asset {
            Asset::Near => Promise::new(recipient)
                .transfer(NearToken::from_yoctonear(amount)),
            Asset::Usdt | Asset::Usdc => {
                ext_ft::ext(self.token_contract_for(&asset))
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
                        Asset::Usdc => {
                            self.accrued_usdc_fees = self
                                .accrued_usdc_fees
                                .checked_add(escrow.platform_fee)
                                .expect("USDC fee accounting overflow");
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
    pub fn retry_failed_settlement(&mut self, escrow_id: String) -> Promise {
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
    pub fn request_refund(&mut self, escrow_id: String, reason: String) {
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
    pub fn raise_dispute(&mut self, escrow_id: String, reason: String) {
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
    // Admin freeze / unfreeze
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
            config_version, self.config_version,
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
            config_version, self.config_version,
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
    pub fn withdraw_platform_fees(&mut self, asset: Asset, amount: U128) -> Promise {
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
            Asset::Usdc => {
                assert!(
                    amount.0 <= self.accrued_usdc_fees,
                    "Insufficient accrued USDC fees"
                );
                self.accrued_usdc_fees -= amount.0;
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

        let transfer = match &asset {
            Asset::Near => Promise::new(treasury)
                .transfer(NearToken::from_yoctonear(amount.0)),
            Asset::Usdt | Asset::Usdc => {
                ext_ft::ext(self.token_contract_for(&asset))
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(FT_TRANSFER_GAS)
                    .ft_transfer(
                        treasury,
                        amount,
                        Some("PayProof platform fees".to_string()),
                    )
            }
        };

        transfer.then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_fee_withdrawal_complete(operation_id, asset, amount),
        )
    }

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
                    Asset::Usdc => {
                        self.accrued_usdc_fees = self
                            .accrued_usdc_fees
                            .checked_add(amount.0)
                            .expect("USDC fee restoration overflow");
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
            "usdc_contract": self.usdc_contract,
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
            "usdc": self.accrued_usdc_fees.to_string(),
            "pending_withdrawal": self.pending_fee_withdrawal.is_some()
        })
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn is_configured(&self) -> bool {
        self.configured
    }

    pub fn get_config_version(&self) -> u64 {
        self.config_version
    }

    pub fn get_operation_version(&self) -> u64 {
        self.operation_version
    }
}