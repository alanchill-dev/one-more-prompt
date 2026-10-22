use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Snapshot {
    pub active: bool,
    pub generation: u64,
}

#[derive(Debug, Default)]
struct State {
    active: bool,
    generation: u64,
}

#[derive(Debug, Default)]
pub struct PromptActivityState {
    state: Mutex<State>,
    changed: Condvar,
}

impl PromptActivityState {
    pub fn shared() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn snapshot(&self) -> Snapshot {
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Snapshot {
            active: state.active,
            generation: state.generation,
        }
    }

    pub fn set_active(&self, active: bool) -> Snapshot {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.active != active {
            state.active = active;
            state.generation = state.generation.wrapping_add(1);
            self.changed.notify_all();
        }
        Snapshot {
            active: state.active,
            generation: state.generation,
        }
    }

    pub fn wait_for_change(&self, generation: u64, timeout: Duration) -> Snapshot {
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (state, _) = self
            .changed
            .wait_timeout_while(state, timeout, |state| state.generation == generation)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Snapshot {
            active: state.active,
            generation: state.generation,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_state_changes_advance_generation() {
        let state = PromptActivityState::default();
        let initial = state.snapshot();
        assert_eq!(
            initial,
            Snapshot {
                active: false,
                generation: 0
            }
        );
        assert_eq!(state.set_active(false), initial);
        assert_eq!(
            state.set_active(true),
            Snapshot {
                active: true,
                generation: 1,
            }
        );
        assert_eq!(
            state.set_active(false),
            Snapshot {
                active: false,
                generation: 2,
            }
        );
    }
}
