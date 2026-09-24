import { PulseLoader } from '@/components/PulseLoader'

/** Mostrado pelo Next enquanto uma página nova carrega (administração e painel do cliente). */
export default function Loading() {
  return <PulseLoader fullscreen size={72} />
}
