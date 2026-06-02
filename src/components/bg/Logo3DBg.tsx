import { Suspense, useRef, Component, useState, useEffect, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

class R3FErrorBoundary extends Component<{ children: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function LogoModel() {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}322-logo.glb`);

  const cloned = scene.clone(true);
  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#00ffcc"),
        emissive: new THREE.Color("#00ffcc"),
        emissiveIntensity: 0.5,
        metalness: 0.9,
        roughness: 0.15,
        transparent: true,
        opacity: 0.6,
      });
    }
  });

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.18;
    groupRef.current.rotation.x = Math.sin(t * 0.12) * 0.08;
    groupRef.current.position.y = Math.sin(t * 0.35) * 0.04;
  });

  return (
    <group ref={groupRef} scale={[1.4, 1.4, 1.4]}>
      <primitive object={cloned} />
    </group>
  );
}

export default function Logo3DBg() {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(isWebGLAvailable());
  }, []);

  if (!webglOk) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.38,
      }}
    >
      <R3FErrorBoundary>
        <Canvas
          camera={{ position: [0, 0, 3.5], fov: 45 }}
          gl={{ alpha: true, antialias: true, failIfMajorPerformanceCaveat: false }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <ambientLight intensity={0.3} color="#00ffcc" />
          <pointLight position={[3, 3, 3]} intensity={1.5} color="#00ffcc" />
          <pointLight position={[-3, -2, 1]} intensity={0.5} color="#ff003c" />
          <Suspense fallback={null}>
            <LogoModel />
          </Suspense>
        </Canvas>
      </R3FErrorBoundary>
    </div>
  );
}
