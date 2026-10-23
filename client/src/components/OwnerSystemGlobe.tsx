import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group } from 'three';

function GlobeNodes() {
  const globe = useRef<Group>(null);
  const [activeNode, setActiveNode] = useState(0);
  useFrame((_state, delta) => {
    if (globe.current) globe.current.rotation.y += delta * 0.13;
  });
  const nodes = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const latitude = Math.acos(1 - 2 * (index + 0.5) / 18);
    const longitude = Math.PI * (1 + Math.sqrt(5)) * index;
    const radius = 1.08;
    return [
      radius * Math.sin(latitude) * Math.cos(longitude),
      radius * Math.cos(latitude),
      radius * Math.sin(latitude) * Math.sin(longitude),
    ] as [number, number, number];
  }), []);
  return (
    <group ref={globe}>
      <mesh>
        <sphereGeometry args={[1, 28, 28]} />
        <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.17} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.94, 32, 32]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.035} />
      </mesh>
      {nodes.map((position, index) => (
        <mesh
          key={index}
          position={position}
          onPointerOver={() => setActiveNode(index)}
          onClick={() => setActiveNode(index)}
        >
          <sphereGeometry args={[activeNode === index ? 0.052 : 0.028, 10, 10]} />
          <meshBasicMaterial color={activeNode === index ? '#4f46e5' : '#38bdf8'} />
        </mesh>
      ))}
    </group>
  );
}

export default function OwnerSystemGlobe() {
  return (
    <div className="relative h-52 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_45%,#effaff_0%,#f8fbff_47%,#ffffff_100%)]">
      <Canvas camera={{ position: [0, 0, 3.6], fov: 42 }} fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Live node visualization requires WebGL.</div>}>
        <ambientLight intensity={1.4} />
        <pointLight position={[2, 2, 3]} intensity={1} color="#38bdf8" />
        <GlobeNodes />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between text-[11px] font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> NODE NETWORK ACTIVE</span>
        <span>LIVE SYSTEM MAP</span>
      </div>
    </div>
  );
}
