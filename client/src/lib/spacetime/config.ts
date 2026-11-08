/** Connection settings. Defaults target a local `spacetime start` server. */
export const SPACETIME_URI = process.env.NEXT_PUBLIC_SPACETIME_HOST ?? 'ws://127.0.0.1:3000';
export const OPS_DB = process.env.NEXT_PUBLIC_OPS_DB ?? 'arrow-ops';
export const IR_DB = process.env.NEXT_PUBLIC_IR_DB ?? 'arrow-ir';
