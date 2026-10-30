import type { VM } from '../model';

// The user's avatar: uploaded photo if any, otherwise initials. Sized by its parent.
export function AvatarFace({ vm, fontSize }: { vm: VM; fontSize: number }) {
  return vm.avatarPhoto
    ? <img src={vm.avatarPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    : <span style={{ fontSize }}>{vm.avatarInitials}</span>;
}
