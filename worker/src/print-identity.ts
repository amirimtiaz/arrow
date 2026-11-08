/** Prints this worker's SpacetimeDB identity (creating and saving a token if needed). */
import { connectOps } from './spacetime';

const { conn, identityHex } = await connectOps(() => undefined);
const authorised = conn.db.opsState.id.find(1)?.agentHex === identityHex;
console.log(JSON.stringify({ identityHex, authorised }));
process.exit(0);
