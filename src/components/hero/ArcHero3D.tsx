import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { ArcLogoMesh } from "./ArcLogoMesh";

export default function ArcHero3D() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.2], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.35} />
      <pointLight position={[-3, 2, 3]} intensity={40} color={"#a855f7"} distance={12} />
      <pointLight position={[3, -2, 3]} intensity={40} color={"#ff6a3d"} distance={12} />
      <pointLight position={[0, 3, -2]} intensity={20} color={"#ec4899"} distance={10} />
      <Suspense fallback={null}>
        <ArcLogoMesh reduced={reduced} />
        <Environment preset="city" />
      </Suspense>
      <EffectComposer>
        <Bloom
          intensity={1.1}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.5}
          mipmapBlur
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          // @ts-ignore — postprocessing expects Vector2, R3F accepts tuple
          offset={[0.0008, 0.0012]}
          radialModulation={false}
          modulationOffset={0}
        />
      </EffectComposer>
    </Canvas>
  );
}
