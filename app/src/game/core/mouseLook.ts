export interface MouseDelta {x:number;y:number}
export interface MouseSample {movementX:number;movementY:number;timeStamp:number}
export interface MouseMotion extends MouseSample {type:string}

/** On Windows Chromium, unadjusted movement bypasses ShouldMoveToCenter:
 * read device deltas instead of moving an invisible cursor back from an edge.
 * Do not silently fall back to the cursor-warp path when raw capture fails.
 * The caller must also verify document.pointerLockElement before enabling look.
 * https://source.chromium.org/chromium/chromium/src/+/main:content/browser/renderer_host/render_widget_host_view_event_handler.cc
 */
export async function requestMouseCapture(
  target:{requestPointerLock:(options:{unadjustedMovement:boolean})=>Promise<void>|void},
):Promise<void> {
  await target.requestPointerLock({unadjustedMovement:true})
}

/** Consume Pointer Lock's mousemove relative delta exactly once. Do not rebuild
 * it from pointer/coalesced screen-coordinate samples: cursor recentering can
 * contribute opposite deltas, and filtering either half changes the net motion.
 * Nor does a large delta imply corruption: a busy frame can merge a fast turn. */
export class MouseLookInput {
  private primed=false
  private since=-Infinity
  reset(time=-Infinity){this.primed=false;this.since=time}

  read(event:MouseMotion,active:boolean):MouseDelta|null {
    if(!active){this.reset(event.timeStamp);return null}
    if(event.type!=='mousemove')return null
    if(!Number.isFinite(event.timeStamp)||event.timeStamp<this.since)return null
    // Capture/re-entry can deliver a whole coalesced batch from before the
    // transition. Drop that batch, not just its first constituent sample.
    if(!this.primed){this.primed=true;return null}
    const x=event.movementX,y=event.movementY
    if(!Number.isFinite(x)||!Number.isFinite(y))return null
    return x||y?{x,y}:null
  }
}
