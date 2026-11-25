type ConnectorProfile = readonly (readonly [along: number, depth: number])[];

type ConnectorStyle = Readonly<{
  label: string;
  profiles: readonly ConnectorProfile[];
  // Fractions of the seam length measured from its midpoint.
  offsets: readonly number[];
  // Cell span at which the profile reaches its full size in board pixels.
  scaleBase: number;
}>;

export const connectorStyles = {
  classic: {
    label: 'Classic',
    profiles: [[
      [-22, 0], [-10, 0], [-11, 4], [-14, 8], [-13, 12], [-9, 16],
      [-4, 17], [4, 17], [9, 16], [13, 12], [14, 8], [11, 4], [10, 0], [22, 0],
    ]],
    offsets: [-0.12, 0, 0.12],
    scaleBase: 104,
  },
  rounded: {
    label: 'Rounded',
    profiles: [
      [[-18, 0], [-15, 2], [-12, 7], [-8, 12], [-3, 14], [3, 14], [8, 12], [12, 7], [15, 2], [18, 0]],
      [[-21, 0], [-16, 2], [-12, 6], [-7, 8], [0, 9], [7, 8], [12, 6], [16, 2], [21, 0]],
    ],
    offsets: [-0.14, 0, 0.14],
    scaleBase: 104,
  },
  angular: {
    label: 'Angular',
    profiles: [
      [[-19, 0], [-12, 4], [-5, 15], [5, 15], [12, 4], [19, 0]],
      [[-21, 0], [-12, 3], [-12, 12], [5, 12], [11, 9], [15, 5], [15, 0]],
    ],
    offsets: [-0.14, 0, 0.14],
    scaleBase: 104,
  },
  none: { label: 'None', profiles: [], offsets: [0], scaleBase: 64 },
} satisfies Record<string, ConnectorStyle>;

export type ConnectorStyleId = keyof typeof connectorStyles;
