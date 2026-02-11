/**
 * SSGM Safety Controller - modes.ts
 * 
 * Safe mode and kill switch functionality.
 */

// Safety state
interface SafetyState {
  safeMode: boolean;
  killSwitch: boolean;
  safeModeActivatedAt: string | null;
  killSwitchActivatedAt: string | null;
  safeModeActivatedBy: string | null;
  killSwitchActivatedBy: string | null;
}

const state: SafetyState = {
  safeMode: process.env.SAFE_MODE === "true",
  killSwitch: process.env.ADMIN_KILL_SWITCH === "true",
  safeModeActivatedAt: null,
  killSwitchActivatedAt: null,
  safeModeActivatedBy: null,
  killSwitchActivatedBy: null,
};

// Actions blocked in safe mode
const SAFE_MODE_BLOCKED_ACTIONS = [
  "file.write",
  "file.delete", 
  "file.rename",
  "file.move",
  "terminal.exec",
  "terminal.spawn",
  "deploy",
  "exec",
  "process",
  "write",
  "edit",
];

/**
 * Check if safe mode is currently enabled
 */
export function isSafeModeEnabled(): boolean {
  return state.safeMode;
}

/**
 * Check if kill switch is currently activated
 */
export function isKillSwitchActive(): boolean {
  return state.killSwitch;
}

/**
 * Get current safety status
 */
export function getSafetyStatus(): {
  safeMode: boolean;
  killSwitch: boolean;
  safeModeActivatedAt: string | null;
  killSwitchActivatedAt: string | null;
  safeModeActivatedBy: string | null;
  killSwitchActivatedBy: string | null;
} {
  return { ...state };
}

/**
 * Enable safe mode
 */
export function enableSafeMode(activatedBy: string = "system"): void {
  if (state.safeMode) return;
  
  state.safeMode = true;
  state.safeModeActivatedAt = new Date().toISOString();
  state.safeModeActivatedBy = activatedBy;
  
  console.warn(`[SAFETY] Safe mode enabled by ${activatedBy}`);
}

/**
 * Disable safe mode
 */
export function disableSafeMode(deactivatedBy: string = "system"): void {
  if (!state.safeMode) return;
  
  state.safeMode = false;
  console.warn(`[SAFETY] Safe mode disabled by ${deactivatedBy}`);
}

/**
 * Toggle safe mode
 */
export function toggleSafeMode(toggledBy: string = "system"): boolean {
  if (state.safeMode) {
    disableSafeMode(toggledBy);
  } else {
    enableSafeMode(toggledBy);
  }
  return state.safeMode;
}

/**
 * Activate kill switch (emergency stop)
 */
export function activateKillSwitch(activatedBy: string = "system"): void {
  if (state.killSwitch) return;
  
  state.killSwitch = true;
  state.killSwitchActivatedAt = new Date().toISOString();
  state.killSwitchActivatedBy = activatedBy;
  
  if (!state.safeMode) {
    enableSafeMode("kill-switch-cascade");
  }
  
  console.error(`[SAFETY] KILL SWITCH ACTIVATED by ${activatedBy}`);
}

/**
 * Check if an action is blocked by safety controls
 */
export function checkSafetyBlock(
  action: string,
  _details?: Record<string, unknown>
): { blocked: boolean; reason?: string; safetySystem: "none" | "safe_mode" | "kill_switch" } {
  // Kill switch takes precedence - blocks everything
  if (state.killSwitch) {
    return {
      blocked: true,
      reason: `Kill switch activated. Emergency stop in effect.`,
      safetySystem: "kill_switch",
    };
  }

  // Safe mode blocks dangerous actions
  if (state.safeMode) {
    if (SAFE_MODE_BLOCKED_ACTIONS.includes(action)) {
      return {
        blocked: true,
        reason: `Safe mode enabled. Action "${action}" is blocked.`,
        safetySystem: "safe_mode",
      };
    }

    for (const blocked of SAFE_MODE_BLOCKED_ACTIONS) {
      if (action.startsWith(blocked + ".") || action.startsWith(blocked + ":")) {
        return {
          blocked: true,
          reason: `Safe mode enabled. Action "${action}" matches blocked pattern "${blocked}".`,
          safetySystem: "safe_mode",
        };
      }
    }
  }

  return { blocked: false, safetySystem: "none" };
}

/**
 * Initialize safety state from environment
 */
export function initializeSafetyModes(): void {
  if (process.env.SAFE_MODE === "true") {
    state.safeMode = true;
    state.safeModeActivatedAt = new Date().toISOString();
    state.safeModeActivatedBy = "environment";
    console.info("[SAFETY] Safe mode initialized from environment");
  }

  if (process.env.ADMIN_KILL_SWITCH === "true") {
    state.killSwitch = true;
    state.killSwitchActivatedAt = new Date().toISOString();
    state.killSwitchActivatedBy = "environment";
    console.error("[SAFETY] Kill switch initialized from environment");
  }
}

/**
 * Reset safety modes (for testing only)
 */
export function resetSafetyModes(forTestingOnly: boolean = false): void {
  if (!forTestingOnly) {
    console.warn("[SAFETY] Reset attempted without testing flag - ignoring");
    return;
  }
  
  state.safeMode = false;
  state.killSwitch = false;
  state.safeModeActivatedAt = null;
  state.killSwitchActivatedAt = null;
  state.safeModeActivatedBy = null;
  state.killSwitchActivatedBy = null;
  
  console.info("[SAFETY] Safety modes reset (testing only)");
}
