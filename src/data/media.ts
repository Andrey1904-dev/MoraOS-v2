/** Stock photography references used by the mock asset / content libraries. */

const shot = (id: number, w: number, h: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`;

export const media = {
  /** Mara — primary character reference (used for avatar + character panels). */
  mara: shot(33821822, 200, 200),
  maraPortrait: shot(33821822, 600, 760),
  portraits: [
    shot(34011808, 800, 1000),
    shot(14995251, 800, 1000),
    shot(17676055, 800, 1000),
    shot(27259671, 800, 1000),
    shot(4982168, 800, 1000),
    shot(37657504, 800, 1000),
    shot(28426361, 800, 1000),
    shot(15102519, 800, 1000),
    shot(2119224, 800, 1000),
  ],
  wide: [
    shot(36136657, 800, 600),
    shot(36055927, 800, 600),
    shot(36195211, 800, 600),
    shot(36067992, 800, 600),
    shot(36411628, 800, 600),
    shot(8235837, 800, 600),
    shot(13735920, 800, 600),
    shot(38674374, 800, 600),
    shot(13550523, 800, 600),
    shot(35798199, 800, 600),
  ],
};

/** Square / small crops for avatars. */
export const face = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=120&h=120`;
