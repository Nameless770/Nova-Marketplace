/**
 * The geometry of every product kind, as a list of primitives.
 *
 * Deliberately renderer-agnostic: a part is plain data, so the same description
 * drives the isometric SVG on a card and the Three.js scene on the detail page.
 * That is what guarantees a product's thumbnail and its 3D model are the same
 * object rather than two things that merely look similar.
 *
 * Space is Y-up and roughly -1..1 on every axis, so a renderer can frame any
 * product without knowing which one it is.
 *
 * Shapes and their `size` tuples:
 *   box    [width, height, depth]
 *   cyl    [radiusTop, radiusBottom, height]
 *   sphere [radius]
 *   cone   [radius, height]
 *   torus  [radius, tube]
 */

const part = (shape, pos, size, color, rot = [0, 0, 0]) => ({ shape, pos, size, color, rot })

// Most goods are a body plus a few details, so these keep the builders short.
const slab = (pos, size, color, rot) => part('box', pos, size, color, rot)
const rod = (pos, size, color, rot) => part('cyl', pos, size, color, rot)

const BUILDERS = {
  // ---------------------------------------------------------------- audio ---
  headphones: (m) => [
    part('torus', [0, 0.35, 0], [0.62, 0.07], m.edge, [0, 0, 0]),
    part('cyl', [-0.6, -0.12, 0], [0.3, 0.3, 0.22], m.base, [0, 0, Math.PI / 2]),
    part('cyl', [0.6, -0.12, 0], [0.3, 0.3, 0.22], m.base, [0, 0, Math.PI / 2]),
    part('cyl', [-0.72, -0.12, 0], [0.22, 0.22, 0.06], m.accent, [0, 0, Math.PI / 2]),
    part('cyl', [0.72, -0.12, 0], [0.22, 0.22, 0.06], m.accent, [0, 0, Math.PI / 2]),
  ],
  earbuds: (m) => [
    part('sphere', [-0.32, 0.1, 0], [0.26], m.base),
    part('sphere', [0.32, 0.1, 0], [0.26], m.base),
    rod([-0.32, -0.3, 0], [0.09, 0.07, 0.42], m.edge),
    rod([0.32, -0.3, 0], [0.09, 0.07, 0.42], m.edge),
    part('sphere', [-0.32, 0.2, 0.14], [0.1], m.accent),
    part('sphere', [0.32, 0.2, 0.14], [0.1], m.accent),
  ],
  turntable: (m) => [
    slab([0, -0.32, 0], [1.5, 0.16, 1.15], m.base),
    rod([-0.12, -0.16, 0], [0.5, 0.5, 0.05], m.edge),
    rod([-0.12, -0.12, 0], [0.09, 0.09, 0.05], m.accent),
    slab([0.55, -0.1, -0.28], [0.07, 0.05, 0.62], m.edge, [0, 0.5, 0]),
    rod([0.6, -0.12, 0.3], [0.12, 0.12, 0.1], m.accent),
  ],
  amplifier: (m) => [
    slab([0, -0.1, 0], [1.45, 0.55, 0.9], m.base),
    slab([0, -0.1, 0.46], [1.3, 0.36, 0.03], m.edge),
    rod([-0.42, -0.1, 0.5], [0.11, 0.11, 0.06], m.accent, [Math.PI / 2, 0, 0]),
    rod([-0.1, -0.1, 0.5], [0.11, 0.11, 0.06], m.edge, [Math.PI / 2, 0, 0]),
    slab([0, -0.42, 0], [1.2, 0.08, 0.7], m.edge),
  ],
  soundbar: (m) => [
    slab([0, -0.05, 0], [1.7, 0.34, 0.34], m.base),
    slab([0, -0.05, 0.18], [1.5, 0.22, 0.02], m.edge),
    rod([0.68, -0.05, 0.2], [0.05, 0.05, 0.03], m.accent, [Math.PI / 2, 0, 0]),
    slab([0, -0.26, 0], [1.4, 0.06, 0.28], m.edge),
  ],
  microphone: (m) => [
    part('sphere', [0, 0.42, 0], [0.34], m.edge),
    rod([0, 0.05, 0], [0.13, 0.13, 0.5], m.base),
    rod([0, -0.32, 0], [0.42, 0.5, 0.14], m.base),
    part('torus', [0, 0.42, 0], [0.35, 0.03], m.accent, [Math.PI / 2, 0, 0]),
  ],
  speaker: (m) => [
    slab([0, 0, 0], [0.86, 1.3, 0.72], m.base),
    part('cyl', [0, 0.24, 0.37], [0.27, 0.27, 0.05], m.edge, [Math.PI / 2, 0, 0]),
    part('cyl', [0, 0.24, 0.4], [0.11, 0.11, 0.03], m.accent, [Math.PI / 2, 0, 0]),
    part('cyl', [0, -0.34, 0.37], [0.16, 0.16, 0.04], m.edge, [Math.PI / 2, 0, 0]),
  ],

  // ------------------------------------------------------------- lighting ---
  deskLamp: (m) => [
    part('cyl', [0, -0.72, 0], [0.42, 0.46, 0.09], m.edge),
    rod([-0.05, -0.28, 0], [0.05, 0.05, 0.82], m.base, [0, 0, 0.12]),
    part('cone', [0.28, 0.42, 0], [0.36, 0.42], m.base, [0, 0, -0.6]),
    part('sphere', [0.34, 0.26, 0], [0.12], '#f6e6c8'),
  ],
  floorLamp: (m) => [
    part('cyl', [0, -0.88, 0], [0.36, 0.42, 0.08], m.edge),
    rod([0, -0.1, 0], [0.045, 0.045, 1.5], m.base),
    part('cone', [0, 0.72, 0], [0.44, 0.46], m.base, [Math.PI, 0, 0]),
    part('sphere', [0, 0.52, 0], [0.14], '#f6e6c8'),
  ],
  sconce: (m) => [
    slab([-0.5, 0, 0], [0.12, 0.86, 0.5], m.edge),
    rod([-0.1, 0.1, 0], [0.05, 0.05, 0.7], m.base, [0, 0, Math.PI / 2]),
    part('cone', [0.42, 0.1, 0], [0.36, 0.4], m.base, [0, 0, Math.PI / 2]),
    part('sphere', [0.3, 0.1, 0], [0.12], '#f6e6c8'),
  ],
  pendant: (m) => [
    rod([0, 0.78, 0], [0.02, 0.02, 0.6], m.edge),
    part('cone', [0, 0.16, 0], [0.56, 0.54], m.base, [Math.PI, 0, 0]),
    part('sphere', [0, -0.1, 0], [0.17], '#f6e6c8'),
    part('torus', [0, 0.44, 0], [0.3, 0.025], m.accent, [Math.PI / 2, 0, 0]),
  ],
  lantern: (m) => [
    part('torus', [0, 0.72, 0], [0.18, 0.03], m.edge, [0, 0, 0]),
    slab([0, 0.5, 0], [0.5, 0.08, 0.5], m.edge),
    slab([0, 0, 0], [0.62, 0.9, 0.62], '#f3e3c4'),
    slab([0, -0.5, 0], [0.56, 0.12, 0.56], m.base),
    rod([0, 0, 0], [0.06, 0.06, 0.8], m.accent),
  ],

  // ------------------------------------------------------------ workspace ---
  monitorArm: (m) => [
    part('cyl', [-0.6, -0.7, 0], [0.34, 0.38, 0.1], m.edge),
    rod([-0.6, -0.1, 0], [0.07, 0.07, 1.1], m.base),
    slab([-0.05, 0.42, 0], [1.1, 0.09, 0.1], m.base, [0, 0, 0.1]),
    slab([0.62, 0.3, 0], [0.14, 0.4, 0.12], m.edge),
    part('sphere', [-0.6, 0.45, 0], [0.11], m.accent),
  ],
  laptopStand: (m) => [
    slab([0, -0.16, 0], [1.2, 0.07, 0.86], m.base, [0.34, 0, 0]),
    slab([-0.5, -0.5, -0.1], [0.09, 0.5, 0.6], m.edge),
    slab([0.5, -0.5, -0.1], [0.09, 0.5, 0.6], m.edge),
    slab([0, 0.12, 0.32], [1.05, 0.05, 0.06], m.accent),
  ],
  cableTray: (m) => [
    slab([0, -0.1, 0], [1.5, 0.4, 0.5], m.base),
    slab([0, 0.12, 0], [1.4, 0.05, 0.42], m.edge),
    rod([-0.45, -0.1, 0.27], [0.08, 0.08, 0.05], m.accent, [Math.PI / 2, 0, 0]),
    rod([0.45, -0.1, 0.27], [0.08, 0.08, 0.05], m.accent, [Math.PI / 2, 0, 0]),
  ],
  deskMat: (m) => [
    slab([0, -0.3, 0], [1.7, 0.07, 1.05], m.base),
    slab([0, -0.25, 0], [1.55, 0.02, 0.92], m.edge),
  ],
  keyboard: (m) => {
    const keys = []
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        keys.push(
          slab(
            [-0.72 + col * 0.18, -0.12, -0.22 + row * 0.2],
            [0.14, 0.06, 0.14],
            row === 2 && col === 4 ? m.accent : m.edge,
          ),
        )
      }
    }
    return [slab([0, -0.24, 0], [1.75, 0.16, 0.78], m.base), ...keys]
  },
  footrest: (m) => [
    slab([0, -0.1, 0], [1.3, 0.16, 0.85], m.base, [0.22, 0, 0]),
    slab([-0.5, -0.5, 0], [0.12, 0.55, 0.6], m.edge),
    slab([0.5, -0.5, 0], [0.12, 0.55, 0.6], m.edge),
  ],
  mouse: (m) => [
    part('sphere', [0, -0.15, 0], [0.42], m.base),
    slab([0, -0.42, 0], [0.62, 0.16, 0.86], m.base),
    slab([0, 0.12, 0.18], [0.05, 0.06, 0.28], m.accent),
  ],

  // -------------------------------------------------------------- kitchen ---
  cuttingBoard: (m) => [
    slab([0, -0.2, 0], [1.4, 0.13, 0.95], m.base),
    // The hanging hole, drawn as a recessed dark plug rather than real geometry:
    // both renderers are additive, so there is nothing to subtract with.
    part('cyl', [0.56, -0.14, 0.3], [0.07, 0.07, 0.06], m.edge),
    slab([0, -0.12, 0], [1.25, 0.02, 0.8], m.edge),
  ],
  knife: (m) => [
    slab([0.25, 0, 0], [1.05, 0.18, 0.04], '#c9ced3', [0, 0, 0.04]),
    slab([0.25, -0.11, 0], [1.05, 0.05, 0.045], '#e6eaee', [0, 0, 0.04]),
    slab([-0.62, -0.02, 0], [0.55, 0.19, 0.13], m.edge),
    part('sphere', [-0.86, -0.02, 0], [0.1], m.accent),
  ],
  bowls: (m) => [
    part('cyl', [0, -0.42, 0], [0.72, 0.5, 0.32], m.base),
    part('cyl', [0, -0.06, 0], [0.55, 0.38, 0.28], m.edge),
    part('cyl', [0, 0.26, 0], [0.38, 0.26, 0.24], m.accent),
  ],
  mug: (m) => [
    part('cyl', [-0.15, -0.05, 0], [0.42, 0.36, 0.86], m.base),
    part('torus', [0.36, -0.05, 0], [0.26, 0.06], m.base, [0, Math.PI / 2, 0]),
    part('cyl', [-0.15, 0.4, 0], [0.4, 0.4, 0.04], m.edge),
  ],
  frenchPress: (m) => [
    part('cyl', [0, -0.15, 0], [0.46, 0.46, 1.05], '#dfe7e9'),
    part('cyl', [0, 0.45, 0], [0.5, 0.5, 0.16], m.edge),
    rod([0, 0.68, 0], [0.05, 0.05, 0.3], m.base),
    part('sphere', [0, 0.86, 0], [0.12], m.accent),
    part('torus', [0.5, -0.2, 0], [0.28, 0.06], m.edge, [0, Math.PI / 2, 0]),
  ],
  pepperMill: (m) => [
    part('cyl', [0, -0.35, 0], [0.34, 0.4, 0.72], m.base),
    part('cyl', [0, 0.16, 0], [0.26, 0.34, 0.32], m.edge),
    rod([0, 0.5, 0], [0.06, 0.06, 0.34], m.accent),
    part('sphere', [0, 0.7, 0], [0.1], m.edge),
  ],
  kettle: (m) => [
    part('cyl', [0, -0.25, 0], [0.5, 0.62, 0.8], m.base),
    part('cyl', [0, 0.2, 0], [0.3, 0.5, 0.14], m.edge),
    part('torus', [0, 0.5, 0], [0.34, 0.05], m.edge, [0, 0, 0]),
    slab([0.6, 0.05, 0], [0.44, 0.08, 0.08], m.base, [0, 0, -0.5]),
    part('sphere', [0, 0.36, 0], [0.1], m.accent),
  ],

  // ----------------------------------------------------------------- home ---
  blanket: (m) => [
    slab([0, -0.28, 0], [1.35, 0.24, 0.95], m.base),
    slab([0, -0.02, 0.03], [1.25, 0.22, 0.88], m.edge),
    slab([0, 0.22, 0.06], [1.15, 0.2, 0.8], m.base),
  ],
  basket: (m) => [
    part('cyl', [0, -0.15, 0], [0.72, 0.5, 0.95], m.base),
    part('torus', [0, 0.32, 0], [0.72, 0.06], m.edge),
    part('torus', [0, -0.1, 0], [0.68, 0.04], m.edge),
    part('torus', [0, -0.45, 0], [0.6, 0.04], m.edge),
  ],
  cushion: (m) => [
    slab([0, 0, 0], [1.15, 1.15, 0.42], m.base),
    part('sphere', [-0.5, 0.5, 0], [0.1], m.edge),
    part('sphere', [0.5, 0.5, 0], [0.1], m.edge),
    part('sphere', [-0.5, -0.5, 0], [0.1], m.edge),
    part('sphere', [0.5, -0.5, 0], [0.1], m.edge),
  ],
  shelf: (m) => [
    slab([0, 0.3, 0], [1.6, 0.09, 0.5], m.base),
    slab([0, -0.35, 0], [1.6, 0.09, 0.5], m.base),
    slab([-0.72, -0.02, 0], [0.09, 0.75, 0.46], m.edge),
    slab([0.72, -0.02, 0], [0.09, 0.75, 0.46], m.edge),
  ],
  vase: (m) => [
    part('cyl', [0, -0.5, 0], [0.34, 0.26, 0.2], m.edge),
    part('cyl', [0, -0.05, 0], [0.3, 0.5, 0.75], m.base),
    part('cyl', [0, 0.45, 0], [0.24, 0.3, 0.26], m.base),
    part('torus', [0, 0.57, 0], [0.24, 0.035], m.accent),
  ],
  mirror: (m) => [
    part('cyl', [0, 0, 0], [0.82, 0.82, 0.08], m.base, [Math.PI / 2, 0, 0]),
    part('cyl', [0, 0, 0.06], [0.7, 0.7, 0.03], '#dfe8ea', [Math.PI / 2, 0, 0]),
    part('torus', [0, 0, 0], [0.82, 0.06], m.edge, [0, 0, 0]),
  ],
  rug: (m) => [
    slab([0, -0.3, 0], [1.75, 0.06, 1.1], m.base),
    slab([0, -0.26, 0], [1.5, 0.02, 0.88], m.edge),
    slab([0, -0.24, 0], [1.15, 0.02, 0.6], m.accent),
  ],

  // ----------------------------------------------------------------- bags ---
  slingPack: (m) => [
    slab([0, -0.1, 0], [0.95, 0.75, 0.42], m.base, [0, 0, 0.2]),
    part('torus', [0.05, 0.35, 0], [0.62, 0.05], m.edge, [0, 0, 0.5]),
    slab([0, -0.2, 0.24], [0.6, 0.34, 0.04], m.accent, [0, 0, 0.2]),
  ],
  messenger: (m) => [
    slab([0, -0.2, 0], [1.25, 0.8, 0.42], m.base),
    slab([0, 0.24, 0.05], [1.28, 0.32, 0.42], m.edge),
    part('torus', [0, 0.3, 0], [0.75, 0.045], m.edge, [0, 0, 0]),
    slab([0, -0.05, 0.23], [0.26, 0.2, 0.05], m.accent),
  ],
  sleeve: (m) => [
    slab([0, 0, 0], [1.35, 0.92, 0.16], m.base),
    slab([0, 0, 0.09], [1.2, 0.78, 0.02], m.edge),
    slab([0.4, -0.38, 0.1], [0.3, 0.06, 0.03], m.accent),
  ],
  weekender: (m) => [
    part('cyl', [0, -0.1, 0], [0.55, 0.55, 1.5], m.base, [0, 0, Math.PI / 2]),
    part('torus', [0, 0.55, 0], [0.34, 0.05], m.edge, [0, 0, Math.PI / 2]),
    slab([0, -0.1, 0.5], [1.1, 0.3, 0.06], m.accent),
  ],
  backpack: (m) => [
    slab([0, -0.05, 0], [0.98, 1.25, 0.55], m.base),
    slab([0, 0.5, 0.06], [0.9, 0.35, 0.5], m.edge),
    slab([-0.3, -0.2, 0.3], [0.12, 0.75, 0.06], m.edge),
    slab([0.3, -0.2, 0.3], [0.12, 0.75, 0.06], m.edge),
    slab([0, -0.35, 0.3], [0.42, 0.28, 0.06], m.accent),
  ],
  tote: (m) => [
    slab([0, -0.15, 0], [1.1, 0.95, 0.42], m.base),
    part('torus', [-0.28, 0.5, 0], [0.24, 0.04], m.edge, [Math.PI / 2, 0, 0]),
    part('torus', [0.28, 0.5, 0], [0.24, 0.04], m.edge, [Math.PI / 2, 0, 0]),
    slab([0, -0.15, 0.23], [0.5, 0.3, 0.03], m.accent),
  ],

  // -------------------------------------------------------------- fitness ---
  bands: (m) => [
    part('torus', [0, 0.2, 0], [0.6, 0.07], m.base, [0.3, 0, 0]),
    part('torus', [0, -0.15, 0], [0.52, 0.06], m.edge, [0.3, 0, 0]),
    part('torus', [0, -0.45, 0], [0.44, 0.05], m.accent, [0.3, 0, 0]),
  ],
  towel: (m) => [
    slab([0, -0.1, 0], [0.95, 1.2, 0.3], m.base),
    slab([0, 0.25, 0.02], [0.98, 0.16, 0.32], m.edge),
    slab([0, -0.25, 0.02], [0.98, 0.16, 0.32], m.accent),
  ],
  yogaMat: (m) => [
    part('cyl', [0, -0.1, 0], [0.52, 0.52, 1.35], m.base, [0, 0, Math.PI / 2]),
    part('cyl', [0, -0.1, 0], [0.2, 0.2, 1.4], m.edge, [0, 0, Math.PI / 2]),
    part('torus', [0, -0.1, 0], [0.56, 0.05], m.accent, [0, 0, Math.PI / 2]),
  ],
  jumpRope: (m) => [
    rod([-0.7, -0.2, 0], [0.09, 0.09, 0.5], m.base),
    rod([0.7, -0.2, 0], [0.09, 0.09, 0.5], m.base),
    part('torus', [0, 0.15, 0], [0.66, 0.03], m.edge, [0, 0, 0]),
    part('sphere', [-0.7, 0.08, 0], [0.11], m.accent),
    part('sphere', [0.7, 0.08, 0], [0.11], m.accent),
  ],
  roller: (m) => [
    part('cyl', [0, 0, 0], [0.5, 0.5, 1.5], m.base, [0, 0, Math.PI / 2]),
    part('cyl', [0, 0, 0], [0.52, 0.52, 0.2], m.edge, [0, 0, Math.PI / 2]),
    part('cyl', [-0.75, 0, 0], [0.2, 0.2, 0.06], m.accent, [0, 0, Math.PI / 2]),
  ],
  kettlebell: (m) => [
    part('sphere', [0, -0.28, 0], [0.62], m.base),
    part('torus', [0, 0.42, 0], [0.34, 0.09], m.edge, [0, 0, 0]),
    part('cyl', [0, 0.1, 0], [0.2, 0.3, 0.24], m.base),
  ],

  // ----------------------------------------------------------- stationery ---
  pen: (m) => [
    part('cyl', [0, -0.1, 0], [0.13, 0.13, 1.25], m.base, [0, 0, 0.25]),
    part('cone', [0.22, 0.78, 0], [0.13, 0.3], m.edge, [0, 0, 0.25]),
    part('cyl', [-0.2, -0.72, 0], [0.1, 0.13, 0.22], m.edge, [0, 0, 0.25]),
    slab([0.16, 0.5, 0.12], [0.05, 0.34, 0.05], m.accent, [0, 0, 0.25]),
  ],
  pencils: (m) => [
    part('cyl', [-0.3, -0.05, 0], [0.1, 0.1, 1.25], m.base, [0, 0, 0.12]),
    part('cyl', [0, -0.05, -0.1], [0.1, 0.1, 1.25], m.edge, [0, 0, -0.05]),
    part('cyl', [0.3, -0.05, 0.05], [0.1, 0.1, 1.25], m.accent, [0, 0, 0.16]),
    part('cone', [-0.22, 0.68, 0], [0.1, 0.24], '#e8d5b5', [0, 0, 0.12]),
    part('cone', [0.04, 0.68, -0.1], [0.1, 0.24], '#e8d5b5', [0, 0, -0.05]),
  ],
  book: (m) => [
    slab([0, -0.12, 0], [1.15, 0.26, 0.85], m.base),
    slab([0, 0.04, 0], [1.1, 0.06, 0.8], '#f4efe6'),
    slab([0, 0.12, 0], [1.15, 0.1, 0.85], m.base),
    slab([-0.5, 0.05, 0], [0.1, 0.4, 0.85], m.edge),
    slab([0.3, 0.18, 0], [0.16, 0.02, 0.5], m.accent),
  ],

  // -------------------------------------------------------------- outdoor ---
  dryBag: (m) => [
    part('cyl', [0, -0.25, 0], [0.6, 0.6, 1.1], m.base),
    slab([0, 0.42, 0], [1.15, 0.22, 0.3], m.edge),
    part('torus', [0, 0.55, 0], [0.3, 0.05], m.accent, [0, 0, Math.PI / 2]),
  ],
  campChair: (m) => [
    slab([0, -0.15, 0.1], [1.0, 0.12, 0.85], m.base, [0.1, 0, 0]),
    slab([0, 0.35, -0.38], [1.0, 0.9, 0.12], m.base, [0.25, 0, 0]),
    rod([-0.45, -0.55, 0.35], [0.05, 0.05, 0.75], m.edge, [0.2, 0, 0]),
    rod([0.45, -0.55, 0.35], [0.05, 0.05, 0.75], m.edge, [0.2, 0, 0]),
    rod([-0.45, -0.55, -0.3], [0.05, 0.05, 0.75], m.edge, [-0.2, 0, 0]),
    rod([0.45, -0.55, -0.3], [0.05, 0.05, 0.75], m.edge, [-0.2, 0, 0]),
  ],
  headTorch: (m) => [
    part('torus', [0, 0.1, 0], [0.62, 0.07], m.edge, [0.2, 0, 0]),
    slab([0, 0.1, 0.6], [0.52, 0.34, 0.26], m.base),
    part('cyl', [0, 0.1, 0.75], [0.16, 0.16, 0.06], '#f6e6c8', [Math.PI / 2, 0, 0]),
    part('cyl', [0, 0.1, 0.78], [0.07, 0.07, 0.03], m.accent, [Math.PI / 2, 0, 0]),
  ],
  coolBox: (m) => [
    slab([0, -0.2, 0], [1.3, 0.75, 0.85], m.base),
    slab([0, 0.26, 0], [1.36, 0.2, 0.9], m.edge),
    part('torus', [0, 0.45, 0], [0.28, 0.05], m.edge, [0, 0, Math.PI / 2]),
    slab([-0.68, -0.2, 0], [0.06, 0.3, 0.5], m.accent),
  ],
  bottle: (m) => [
    part('cyl', [0, -0.25, 0], [0.4, 0.4, 1.0], m.base),
    part('cyl', [0, 0.38, 0], [0.19, 0.36, 0.3], m.base),
    part('cyl', [0, 0.6, 0], [0.21, 0.21, 0.18], m.edge),
    part('torus', [0, 0.05, 0], [0.41, 0.04], m.accent),
  ],

  // ---------------------------------------------------------- accessories ---
  wallet: (m) => [
    slab([0, 0, 0], [1.1, 0.78, 0.14], m.base),
    slab([0, -0.08, 0.09], [1.0, 0.5, 0.02], m.edge),
    slab([0, 0.16, 0.1], [0.62, 0.28, 0.02], m.accent),
  ],
  keyOrganiser: (m) => [
    slab([0, 0.1, 0], [0.28, 0.85, 0.16], m.base),
    slab([-0.16, -0.28, 0], [0.16, 0.7, 0.04], m.edge, [0, 0, 0.25]),
    slab([0.16, -0.28, 0], [0.16, 0.7, 0.04], m.edge, [0, 0, -0.25]),
    part('torus', [0, 0.52, 0], [0.14, 0.035], m.accent, [Math.PI / 2, 0, 0]),
  ],
  watchStrap: (m) => [
    part('torus', [0, 0, 0], [0.66, 0.11], m.base, [0.35, 0, 0]),
    part('cyl', [0, 0.1, 0.3], [0.36, 0.36, 0.14], m.edge, [Math.PI / 2, 0, 0]),
    part('cyl', [0, 0.1, 0.38], [0.29, 0.29, 0.03], '#e9eef0', [Math.PI / 2, 0, 0]),
    part('sphere', [0.36, 0.1, 0.3], [0.07], m.accent),
  ],
  sunglasses: (m) => [
    part('cyl', [-0.42, 0.05, 0], [0.34, 0.34, 0.07], m.edge, [Math.PI / 2, 0, 0]),
    part('cyl', [0.42, 0.05, 0], [0.34, 0.34, 0.07], m.edge, [Math.PI / 2, 0, 0]),
    slab([0, 0.08, 0], [0.28, 0.07, 0.07], m.base),
    slab([-0.78, 0.02, -0.24], [0.1, 0.06, 0.5], m.base, [0, 0.35, 0]),
    slab([0.78, 0.02, -0.24], [0.1, 0.06, 0.5], m.base, [0, -0.35, 0]),
  ],
  belt: (m) => [
    part('torus', [0, 0, 0], [0.7, 0.1], m.base, [0.42, 0, 0]),
    slab([0, 0.18, 0.62], [0.34, 0.3, 0.06], m.edge),
    slab([0, 0.18, 0.66], [0.2, 0.18, 0.03], m.accent),
  ],

  // Fallback for a title that names nothing we model — a plain crafted object.
  box: (m) => [
    slab([0, -0.1, 0], [1.05, 0.7, 0.75], m.base),
    slab([0, 0.28, 0], [1.1, 0.12, 0.8], m.edge),
    slab([0, -0.1, 0.39], [0.3, 0.24, 0.03], m.accent),
  ],
}

/**
 * The primitives for one product, already coloured and proportioned.
 *
 * `scale`, `stretch` and `tilt` come from the product's slug, so two Desk Lamps
 * differ in height and lean without either stopping being a desk lamp.
 */
export function partsFor(model) {
  const build = BUILDERS[model.kind] ?? BUILDERS.box
  const colours = {
    base: model.material.base,
    edge: model.material.edge,
    accent: model.accent,
  }
  return build(colours).map((piece) => ({
    ...piece,
    pos: [piece.pos[0] * model.scale, piece.pos[1] * model.stretch, piece.pos[2] * model.scale],
    size: piece.size.map((value) => value * model.scale),
  }))
}

export const KIND_COUNT = Object.keys(BUILDERS).length
