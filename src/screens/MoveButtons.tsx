// The ↑ / ↓ reorder pair of a list row (trajectory steps, plan modules).
import { iconButton } from './labelStyle';


export function MoveButtons({ what, noUp, noDown, up, down }: { what: string; noUp: boolean; noDown: boolean; up: () => void; down: () => void }) {
  return (
    <>
      <button type="button" aria-label={`Move ${what} up`} onClick={up} disabled={noUp} style={{ ...iconButton, opacity: noUp ? 0.35 : 1 }}>↑</button>
      <button type="button" aria-label={`Move ${what} down`} onClick={down} disabled={noDown} style={{ ...iconButton, opacity: noDown ? 0.35 : 1 }}>↓</button>
    </>
  );
}
