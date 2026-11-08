# arrow
Arrow is a platform used to demystify the supply chain process.

## Who can see what

Arrow is open by default. Any employee at any level can view Silk Road, the live feed and analytics, and share briefings and reports. Two things are gated:

| Area | Who | Enforced by |
|---|---|---|
| Silk Road, feed, analytics, reports | Any employee | No gate |
| Approving a reroute, vendor switch or expedite | Managers | Role check in `approve_action` / `reject_action` |
| Cyber Control Tower | Invited incident-response members only | Separate `arrow-ir` database; every IR reducer checks the caller's role |

### Control Tower access screen

_Status: planned. Update this section as it is built._

Opening the Control Tower without incident-response membership shows an access screen instead of incident data. No incident data loads until the user is an active member.

The access screen:
- says plainly that this area is for the incident response team only and is isolated from corporate accounts and networks
- asks for the one-time access code an admin shared in person or by phone
- calls `redeem_invite(code)`; on success, the Control Tower opens with the role on that invite
- shows a clear message for a wrong or expired code, a revoked member, or lockdown (no new members allowed)
- on a fresh install, accepts the one-time bootstrap code that creates the first admin

**In the demo:** window 1 is the incident commander, who clicks "Invite responder" and reads the code aloud. Window 2 opens the Control Tower, lands on the access screen, enters the code and joins the incident chat live.

**The screen is the front door, not the lock.** The server enforces access: IR reducers reject anyone who is not an active member, and IR data is readable only by members. Skipping the screen or calling the database directly does not get around this.
