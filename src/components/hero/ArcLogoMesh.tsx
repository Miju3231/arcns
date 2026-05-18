import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Extruded bold "A" — built from 3 box segments (left leg, right leg, crossbar)
 * to avoid needing a font loader. Centered around origin.
 */
function buildAGeometry() {
  const group: THREE.BufferGeometry[] = [];

  // Dimensions
  const height = 2.4;
  const halfH = height / 2;
  const baseHalf = 0.95;        // half base width
  const topHalf = 0.18;         // half top width (the apex)
  const legThickness = 0.32;
  const depth = 0.55;
  const bevel = 0.06;

  // Slanted leg via ExtrudeGeometry from a Shape (parallelogram-ish)
  const makeLeg = (mirror: boolean) => {
    const s = new THREE.Shape();
    const sign = mirror ? -1 : 1;
    const xb1 = sign * baseHalf;
    const xb2 = sign * (baseHalf - legThickness);
    const xt1 = sign * topHalf;
    const xt2 = sign * (topHalf + legThickness);
    s.moveTo(xb1, -halfH);
    s.lineTo(xb2, -halfH);
    s.lineTo(xt1, halfH);
    s.lineTo(xt2, halfH);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 4,
    });
  };

  const left = makeLeg(true);
  const right = makeLeg(false);

  // Crossbar
  const barWidth = 1.05;
  const barHeight = 0.34;
  const barShape = new THREE.Shape();
  barShape.moveTo(-barWidth / 2, -barHeight / 2);
  barShape.lineTo(barWidth / 2, -barHeight / 2);
  barShape.lineTo(barWidth / 2, barHeight / 2);
  barShape.lineTo(-barWidth / 2, barHeight / 2);
  barShape.closePath();
  const bar = new THREE.ExtrudeGeometry(barShape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  bar.translate(0, -0.25, 0);

  // center along Z
  [left, right, bar].forEach((g) => g.translate(0, 0, -depth / 2));
  group.push(left, right, bar);
  return group;
}

export function ArcLogoMesh({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const geoms = useMemo(() => buildAGeometry(), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (reduced) {
      group.current.rotation.y = -0.35;
      group.current.rotation.x = 0.15;
      return;
    }
    group.current.rotation.y += delta * 0.45;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.18;
  });

  return (
    <group ref={group}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={"#ff6a3d"}
            metalness={0.85}
            roughness={0.18}
            clearcoat={1}
            clearcoatRoughness={0.1}
            iridescence={1}
            iridescenceIOR={1.6}
            // iridescenceThicknessRange not strongly typed in some R3F versions
            // @ts-ignore
            iridescenceThicknessRange={[100, 800]}
            emissive={"#ff3c00"}
            emissiveIntensity={0.18}
          />
        </mesh>
      ))}
    </group>
  );
}
