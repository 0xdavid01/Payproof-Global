use near_sdk::json_types::U128;
use near_sdk::serde_json;
use near_sdk::serde_json::json;
use near_sdk::{
    env, near, AccountId, Gas, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};
use std::collections::HashMap;

const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(5);
const GAS_FOR_FT_TRANSFER_CALL: Gas = Gas::from_tgas(25);

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct UsdtStub {
    pub accounts: HashMap<AccountId, u128>,
    pub total_supply: u128,
}

#[near]
impl UsdtStub {
    #[init]
    pub fn new() -> Self {
        Self {
            accounts: HashMap::new(),
            total_supply: 0,
        }
    }

    /// Test-only mint. No access control — this is a stub.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        let entry = self.accounts.entry(account_id).or_insert(0);
        *entry += amount.0;
        self.total_supply += amount.0;
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(*self.accounts.get(&account_id).unwrap_or(&0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_metadata(&self) -> serde_json::Value {
        json!({
            "spec": "ft-1.0.0",
            "name": "Tether USD (Test Stub)",
            "symbol": "USDT",
            "icon": null,
            "reference": null,
            "reference_hash": null,
            "decimals": 6
        })
    }

    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, _memo: Option<String>) {
        near_sdk::assert_one_yocto();
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0);
    }

    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        _memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        near_sdk::assert_one_yocto();
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0);

        let receiver_gas = env::prepaid_gas()
            .saturating_sub(GAS_FOR_FT_TRANSFER_CALL)
            .saturating_sub(GAS_FOR_RESOLVE_TRANSFER);

        Promise::new(receiver_id.clone())
            .function_call(
                "ft_on_transfer".to_string(),
                json!({
                    "sender_id": sender,
                    "amount": U128(amount.0),
                    "msg": msg
                })
                .to_string()
                .into_bytes(),
                near_sdk::NearToken::from_yoctonear(0),
                receiver_gas,
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "ft_resolve_transfer".to_string(),
                    json!({
                        "sender_id": sender,
                        "receiver_id": receiver_id,
                        "amount": U128(amount.0)
                    })
                    .to_string()
                    .into_bytes(),
                    near_sdk::NearToken::from_yoctonear(0),
                    GAS_FOR_RESOLVE_TRANSFER,
                ),
            )
            .into()
    }

    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        match env::promise_result(0) {
            PromiseResult::Successful(value) => {
                if let Ok(unused) = near_sdk::serde_json::from_slice::<U128>(&value) {
                    let refund = unused.0.min(amount.0);
                    if refund > 0 {
                        self.internal_transfer(&receiver_id, &sender_id, refund);
                    }
                    U128(refund)
                } else {
                    U128(0)
                }
            }
            _ => {
                self.internal_transfer(&receiver_id, &sender_id, amount.0);
                U128(amount.0)
            }
        }
    }

    fn internal_transfer(&mut self, sender: &AccountId, receiver: &AccountId, amount: u128) {
        assert!(amount > 0, "Amount must be positive");
        assert_ne!(sender, receiver, "Sender and receiver must differ");

        let sender_balance = *self.accounts.get(sender).unwrap_or(&0);
        assert!(sender_balance >= amount, "Insufficient balance");

        self.accounts.insert(sender.clone(), sender_balance - amount);
        let receiver_balance = *self.accounts.get(receiver).unwrap_or(&0);
        self.accounts.insert(receiver.clone(), receiver_balance + amount);
    }
}