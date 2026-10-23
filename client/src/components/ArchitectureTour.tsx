import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

type Node = { id: string; label: string; detail: string };

function ArchitectureNodes({ nodes, selected, onSelect }: { nodes: Node[]; selected: string; onSelect: (id: string) => void }) {
  const group = useRef<Group>(null);
  const points = useMemo(() => [
    [0, 0.8, 0],
    [-0.82, -0.48, 0.06],
    [0.82, -0.48, -0.06],
  ] as [number, number, number][], []);
  const linePositions = useMemo(() => new Float32Array([
    ...points[0], ...points[1],
    ...points[1], ...points[2],
    ...points[2], ...points[0],
  ]), [points]);
  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.16;
  });

  return (
    <group ref={group}>
      <lineSegments>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[linePositions, 3]} /></bufferGeometry>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.72} />
      </lineSegments>
      {nodes.map((node, index) => (
        <mesh key={node.id} position={points[index]} onClick={() => onSelect(node.id)}>
          <sphereGeometry args={[selected === node.id ? 0.18 : 0.13, 18, 18]} />
          <meshStandardMaterial color={selected === node.id ? '#4f46e5' : '#0ea5e9'} emissive="#0284c7" emissiveIntensity={0.18} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.88, 28, 28]} />
        <meshBasicMaterial color="#bae6fd" wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

export default function ArchitectureTour({ nodes, selected, onSelect }: { nodes: Node[]; selected: string; onSelect: (id: string) => void }) {
  const visibleNodes = nodes.slice(0, 3);
  if (visibleNodes.length < 3) return null;
  return (
    <div className="h-52 overflow-hidden rounded-xl border border-sky-100 bg-[radial-gradient(circle_at_50%_45%,#f0f9ff,#ffffff_80%)]" aria-label="Interactive project architecture node map">
      <Canvas camera={{ position: [0, 0, 3.5], fov: 42 }} fallback={<p className="grid h-full place-items-center text-xs text-slate-500">3D architecture view requires WebGL.</p>}>
        <ambientLight intensity={1.5} />
        <pointLight position={[2, 2, 2]} intensity={1.2} color="#38bdf8" />
        <ArchitectureNodes nodes={visibleNodes} selected={selected} onSelect={onSelect} />
      </Canvas>
    </div>
  );
}
