'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  Globe,
  Eye,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  MapPin,
  Zap,
  RefreshCw,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Search,
  ArrowUpRight,
  Clock,
  Sparkles,
  Compass,
  ChevronRight,
  Flame,
  CheckCircle2,
  X,
} from 'lucide-react'

interface LiveOrder {
  id: string
  total: number
  city: string
  state: string
  product: string
  channel: string
  timeAgo: string
  timestamp: number
}

interface LiveEvent {
  id: string
  type: 'order' | 'checkout' | 'cart' | 'visit'
  title: string
  description: string
  city: string
  state: string
  value?: number
  channel: string
  timeAgo: string
  timestamp: number
}

interface CityLocation {
  name: string
  city: string
  state: string
  lat: number
  lng: number
  visitors: number
  ordersToday: number
  channel: string
  recentOrder?: { product: string; total: number; time: string }
}

interface EcommerceLiveViewProps {
  initialRevenue?: number
  initialOrdersCount?: number
  currency?: string
  clientSlug?: string
}

function fmtMoney(v: number, cur = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v)
}

// Cidades ativas pré-configuradas (foco Brasil + internacionais)
const INITIAL_CITIES: CityLocation[] = [
  { name: 'São Paulo, SP', city: 'São Paulo', state: 'SP', lat: -23.5505, lng: -46.6333, visitors: 7, ordersToday: 14, channel: 'Instagram Ads', recentOrder: { product: 'Sérum Facial Vitamina C', total: 189.90, time: 'há 12s' } },
  { name: 'Rio de Janeiro, RJ', city: 'Rio de Janeiro', state: 'RJ', lat: -22.9068, lng: -43.1729, visitors: 3, ordersToday: 6, channel: 'Meta Ads', recentOrder: { product: 'Combo Pele Radiante', total: 297.00, time: 'há 45s' } },
  { name: 'Belo Horizonte, MG', city: 'Belo Horizonte', state: 'MG', lat: -19.9167, lng: -43.9345, visitors: 2, ordersToday: 4, channel: 'Instagram Stories' },
  { name: 'Curitiba, PR', city: 'Curitiba', state: 'PR', lat: -25.4290, lng: -49.2671, visitors: 2, ordersToday: 3, channel: 'Google Ads', recentOrder: { product: 'Espuma de Limpeza', total: 98.50, time: 'há 2m' } },
  { name: 'Porto Alegre, RS', city: 'Porto Alegre', state: 'RS', lat: -30.0346, lng: -51.2177, visitors: 1, ordersToday: 2, channel: 'Meta Ads' },
  { name: 'Florianópolis, SC', city: 'Florianópolis', state: 'SC', lat: -27.5954, lng: -48.5480, visitors: 1, ordersToday: 1, channel: 'Instagram Reels' },
  { name: 'Salvador, BA', city: 'Salvador', state: 'BA', lat: -12.9777, lng: -38.5016, visitors: 1, ordersToday: 1, channel: 'WhatsApp Direto' },
  { name: 'Brasília, DF', city: 'Brasília', state: 'DF', lat: -15.7975, lng: -47.8919, visitors: 1, ordersToday: 1, channel: 'Google Search' },
  { name: 'Fortaleza, CE', city: 'Fortaleza', state: 'CE', lat: -3.7172, lng: -38.5434, visitors: 1, ordersToday: 1, channel: 'Instagram Ads' },
  { name: 'Goiânia, GO', city: 'Goiânia', state: 'GO', lat: -16.6869, lng: -49.2648, visitors: 1, ordersToday: 0, channel: 'Meta Ads' },
  { name: 'Recife, PE', city: 'Recife', state: 'PE', lat: -8.0476, lng: -34.8770, visitors: 1, ordersToday: 0, channel: 'Instagram Ads' },
  { name: 'Campinas, SP', city: 'Campinas', state: 'SP', lat: -22.9056, lng: -47.0608, visitors: 1, ordersToday: 1, channel: 'Google Ads' },
  { name: 'Vitória, ES', city: 'Vitória', state: 'ES', lat: -20.3155, lng: -40.3128, visitors: 1, ordersToday: 0, channel: 'Instagram Stories' },
  { name: 'Lisboa, PT', city: 'Lisboa', state: 'PT', lat: 38.7223, lng: -9.1393, visitors: 1, ordersToday: 0, channel: 'Direto' },
  { name: 'Miami, EUA', city: 'Miami', state: 'EUA', lat: 25.7617, lng: -80.1918, visitors: 1, ordersToday: 0, channel: 'Direto' },
]

// Pontos de amostragem geográfica para os continentes (estilo Shopfiy Live View dot-matrix)
function isLandCoordinate(lat: number, lng: number): boolean {
  // América do Sul (com grande detalhe no Brasil)
  if (lat >= -56 && lat <= 13 && lng >= -82 && lng <= -34) {
    if (lat > 5 && lng < -77) return false
    if (lat > 0 && lng > -48 && lat > 8) return false
    if (lat < -20 && lng > -39) return false
    if (lat < -40 && lng > -60) return false
    if (lat < -15 && lng < -75) return false
    if (lat < -45 && lng < -76) return false
    return true
  }
  // América Central & Caribe
  if (lat >= 8 && lat <= 24 && lng >= -105 && lng <= -60) {
    if (lng > -80 && lat < 18 && (lng > -75 || lat < 10)) return false
    return true
  }
  // América do Norte
  if (lat >= 24 && lat <= 71 && lng >= -168 && lng <= -52) {
    if (lat < 30 && lng > -80) return false
    if (lat < 28 && lng < -100 && lat < 32 && lng < -115) return false
    if (lat > 55 && lng > -55) return false
    if (lng < -130 && lat < 50) return false
    return true
  }
  // Europa
  if (lat >= 36 && lat <= 71 && lng >= -10 && lng <= 42) {
    if (lat < 42 && lng > 28) return false
    if (lat < 38 && lng < -5) return false
    return true
  }
  // África
  if (lat >= -35 && lat <= 37 && lng >= -18 && lng <= 52) {
    if (lat > 20 && lng < -17) return false
    if (lat < -5 && lng < 10) return false
    if (lat < -20 && lng < 14) return false
    if (lat < -30 && lng > 33) return false
    if (lat > 15 && lng > 43 && lat < 30) return false
    return true
  }
  // Ásia
  if (lat >= 1 && lat <= 75 && lng >= 42 && lng <= 145) {
    if (lat < 10 && lng < 95) return false
    if (lat < 22 && lng < 60) return false
    if (lat > 5 && lat < 25 && lng > 60 && lng < 70) return false
    if (lat < 20 && lng > 80 && lng < 95) return false
    return true
  }
  // Oceania / Austrália
  if (lat >= -44 && lat <= -10 && lng >= 112 && lng <= 154) {
    if (lat < -38 && lng < 140) return false
    return true
  }
  if (lat >= -47 && lat <= -34 && lng >= 166 && lng <= 178) {
    return true
  }
  return false
}

// Gera a malha estática de pontos globais uma única vez
const CONTINENT_DOTS: { lat: number; lng: number; phi: number; lam: number }[] = (() => {
  const dots: { lat: number; lng: number; phi: number; lam: number }[] = []
  const step = 3.6
  for (let lat = -58; lat <= 72; lat += step) {
    for (let lng = -180; lng <= 180; lng += step) {
      if (isLandCoordinate(lat, lng)) {
        dots.push({
          lat,
          lng,
          phi: (lat * Math.PI) / 180,
          lam: (lng * Math.PI) / 180,
        })
      }
    }
  }
  return dots
})()

export function EcommerceLiveView({
  initialRevenue = 4890.0,
  initialOrdersCount = 31,
  currency = 'BRL',
}: EcommerceLiveViewProps) {
  // Estado de data & hora ao vivo
  const [liveTime, setLiveTime] = useState('')

  // Métricas em tempo real
  const [visitorsOnline, setVisitorsOnline] = useState(17)
  const [totalSalesToday, setTotalSalesToday] = useState(initialRevenue)
  const [totalOrdersToday, setTotalOrdersToday] = useState(initialOrdersCount)
  const [totalSessionsToday, setTotalSessionsToday] = useState(2418)

  // Funil de 10 minutos (Customer behavior)
  const [behaviorVisiting, setBehaviorVisiting] = useState(17)
  const [behaviorCart, setBehaviorCart] = useState(6)
  const [behaviorCheckout, setBehaviorCheckout] = useState(3)
  const [behaviorPurchased, setBehaviorPurchased] = useState(4)

  // Cidades e eventos
  const [cities, setCities] = useState<CityLocation[]>(INITIAL_CITIES)
  const [selectedStateFilter, setSelectedStateFilter] = useState<string | null>(null)
  const [hoveredCity, setHoveredCity] = useState<CityLocation | null>(null)
  const [activeOrderBeacon, setActiveOrderBeacon] = useState<{
    city: string
    state: string
    product: string
    value: number
    time: number
  } | null>({
    city: 'São Paulo',
    state: 'SP',
    product: 'Sérum Facial Vitamina C',
    value: 189.90,
    time: Date.now(),
  })

  // Feed de atividades em tempo real
  const [events, setEvents] = useState<LiveEvent[]>([
    {
      id: 'ev-1',
      type: 'order',
      title: 'Pedido Aprovado',
      description: 'Sérum Facial Vitamina C (R$ 189,90) via Pix',
      city: 'São Paulo',
      state: 'SP',
      value: 189.90,
      channel: 'Instagram Ads',
      timeAgo: 'há 12s',
      timestamp: Date.now() - 12000,
    },
    {
      id: 'ev-2',
      type: 'checkout',
      title: 'Iniciou Checkout',
      description: 'Combo Pele Radiante Glow (R$ 297,00)',
      city: 'Rio de Janeiro',
      state: 'RJ',
      value: 297.00,
      channel: 'Meta Ads',
      timeAgo: 'há 45s',
      timestamp: Date.now() - 45000,
    },
    {
      id: 'ev-3',
      type: 'cart',
      title: 'Adicionou ao Carrinho',
      description: 'Espuma de Limpeza Profunda Facial',
      city: 'Belo Horizonte',
      state: 'MG',
      value: 98.50,
      channel: 'Instagram Stories',
      timeAgo: 'há 1m',
      timestamp: Date.now() - 75000,
    },
    {
      id: 'ev-4',
      type: 'order',
      title: 'Pedido Aprovado',
      description: 'Hidratante Noturno Reparador (R$ 149,00)',
      city: 'Curitiba',
      state: 'PR',
      value: 149.00,
      channel: 'Google Ads',
      timeAgo: 'há 2m',
      timestamp: Date.now() - 120000,
    },
    {
      id: 'ev-5',
      type: 'visit',
      title: 'Novo Visitante',
      description: 'Navegando pela Coleção Anti-Idade',
      city: 'Porto Alegre',
      state: 'RS',
      channel: 'Meta Ads',
      timeAgo: 'há 2m',
      timestamp: Date.now() - 145000,
    },
    {
      id: 'ev-6',
      type: 'checkout',
      title: 'Iniciou Checkout',
      description: 'Kit Essencial Skincare (R$ 229,00)',
      city: 'Florianópolis',
      state: 'SC',
      value: 229.00,
      channel: 'Instagram Reels',
      timeAgo: 'há 3m',
      timestamp: Date.now() - 180000,
    },
  ])

  // Busca e filtro
  const [searchQuery, setSearchQuery] = useState('')

  // Controles do Globo 3D
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const [zoom, setZoom] = useState(1.0)

  // Ângulos de rotação do Globo (radianos)
  // rotY: longitude (centralizado em torno de -48° para o Brasil)
  // rotX: latitude/tilt (inclinado em torno de -16° para visualizar bem o Brasil)
  const rotYRef = useRef(-0.84)
  const rotXRef = useRef(-0.28)
  const targetRotRef = useRef<{ x: number; y: number } | null>(null)

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  // Atualizador de relógio ao vivo
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setLiveTime(
        now.toLocaleString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' BRT'
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Atualização em tempo real dos contadores e eventos periódicos
  useEffect(() => {
    const interval = setInterval(() => {
      // Flutuação orgânica do número de visitantes
      setVisitorsOnline(prev => {
        const delta = Math.floor(Math.random() * 3) - 1 // -1, 0, +1
        const next = Math.max(12, Math.min(24, prev + delta))
        setBehaviorVisiting(next)
        return next
      })

      // Sessões incrementam lentamente
      setTotalSessionsToday(prev => prev + (Math.random() > 0.4 ? 1 : 0))

      // Atualiza os minutos do funil de comportamento
      setBehaviorCart(prev => Math.max(4, Math.min(9, prev + (Math.random() > 0.5 ? 1 : -1))))
      setBehaviorCheckout(prev => Math.max(2, Math.min(6, prev + (Math.random() > 0.6 ? 1 : -1))))

      // Sorteio de novo evento aleatório (carrinho, checkout, visita ou compra)
      const roll = Math.random()
      const availableCities = INITIAL_CITIES.filter(c => c.state !== 'PT' && c.state !== 'EUA')
      const targetCity = availableCities[Math.floor(Math.random() * availableCities.length)]

      if (roll < 0.20) {
        // Novo pedido aprovado!
        const products = [
          { name: 'Sérum Facial Vitamina C', price: 189.90 },
          { name: 'Combo Pele Radiante Glow', price: 297.00 },
          { name: 'Espuma de Limpeza Profunda', price: 98.50 },
          { name: 'Hidratante Noturno Reparador', price: 149.00 },
          { name: 'Protetor Solar Facial FPS 50', price: 119.00 },
        ]
        const prod = products[Math.floor(Math.random() * products.length)]

        setTotalOrdersToday(prev => prev + 1)
        setTotalSalesToday(prev => prev + prod.price)
        setBehaviorPurchased(prev => prev + 1)

        setActiveOrderBeacon({
          city: targetCity.city,
          state: targetCity.state,
          product: prod.name,
          value: prod.price,
          time: Date.now(),
        })

        const newEv: LiveEvent = {
          id: `ev-${Date.now()}`,
          type: 'order',
          title: 'Pedido Aprovado',
          description: `${prod.name} (${fmtMoney(prod.price, currency)})`,
          city: targetCity.city,
          state: targetCity.state,
          value: prod.price,
          channel: targetCity.channel,
          timeAgo: 'agora',
          timestamp: Date.now(),
        }

        setEvents(prev => [newEv, ...prev.slice(0, 14)])
      } else if (roll < 0.50) {
        // Novo checkout
        const newEv: LiveEvent = {
          id: `ev-${Date.now()}`,
          type: 'checkout',
          title: 'Iniciou Checkout',
          description: 'Avançou para tela de pagamento',
          city: targetCity.city,
          state: targetCity.state,
          channel: targetCity.channel,
          timeAgo: 'agora',
          timestamp: Date.now(),
        }
        setEvents(prev => [newEv, ...prev.slice(0, 14)])
      } else if (roll < 0.75) {
        // Adicionou ao carrinho
        const newEv: LiveEvent = {
          id: `ev-${Date.now()}`,
          type: 'cart',
          title: 'Adicionou ao Carrinho',
          description: 'Item adicionado à sacola de compras',
          city: targetCity.city,
          state: targetCity.state,
          channel: targetCity.channel,
          timeAgo: 'agora',
          timestamp: Date.now(),
        }
        setEvents(prev => [newEv, ...prev.slice(0, 14)])
      }
    }, 4500)

    return () => clearInterval(interval)
  }, [currency])

  // Função para girar suavemente até uma coordenada
  const focusOnCoordinates = useCallback((lat: number, lng: number) => {
    setAutoRotate(false)
    const targetY = -(lng * Math.PI) / 180
    const targetX = -(lat * Math.PI) / 180 * 0.75 // amortecimento leve de inclinação
    targetRotRef.current = { x: targetX, y: targetY }
  }, [])

  // Foco em um estado específico
  const handleSelectState = (st: string) => {
    if (selectedStateFilter === st) {
      setSelectedStateFilter(null)
      // Volta a focar no centro do Brasil
      focusOnCoordinates(-14.235, -51.9253)
      return
    }
    setSelectedStateFilter(st)
    const match = cities.find(c => c.state === st)
    if (match) {
      focusOnCoordinates(match.lat, match.lng)
    }
  }

  // Executa busca de cidade
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    const q = searchQuery.toLowerCase().trim()
    const found = cities.find(
      c => c.city.toLowerCase().includes(q) || c.state.toLowerCase() === q || c.name.toLowerCase().includes(q)
    )
    if (found) {
      focusOnCoordinates(found.lat, found.lng)
      setHoveredCity(found)
    }
  }

  // Engine do Canvas 3D do Globo
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number

    // Render loop
    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = rect.width
      const height = rect.height

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Animação de rotação suave até o target selecionado
      if (targetRotRef.current) {
        const dx = targetRotRef.current.x - rotXRef.current
        const dy = targetRotRef.current.y - rotYRef.current
        rotXRef.current += dx * 0.08
        rotYRef.current += dy * 0.08
        if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) {
          targetRotRef.current = null
        }
      } else if (autoRotate && !isDraggingRef.current) {
        rotYRef.current += 0.0025
      }

      const cx = width / 2
      const cy = height / 2
      const baseRadius = Math.min(width, height) * 0.38
      const R = baseRadius * zoom

      const rotX = rotXRef.current
      const rotY = rotYRef.current

      // 1. Halo atmosférico suave externo
      const haloGrad = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.15)
      haloGrad.addColorStop(0, 'rgba(56, 189, 248, 0.18)')
      haloGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)')
      haloGrad.addColorStop(1, 'rgba(56, 189, 248, 0)')
      ctx.fillStyle = haloGrad
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2)
      ctx.fill()

      // 2. Esfera do Oceano (Globo 3D)
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      // Fundo oceânico com gradiente radial de iluminação realista
      const oceanGrad = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.35,
        R * 0.1,
        cx,
        cy,
        R
      )
      oceanGrad.addColorStop(0, '#1e293b') // Iluminado
      oceanGrad.addColorStop(0.6, '#0f172a') // Profundo
      oceanGrad.addColorStop(1, '#050914') // Borda escura
      ctx.fillStyle = oceanGrad
      ctx.fill()

      // Paralelos e Meridianos sutis (Graticule)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.lineWidth = 1
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath()
        const latRad = (lat * Math.PI) / 180
        const yOffset = -R * Math.sin(latRad) * Math.cos(rotX)
        const radiusAtLat = R * Math.cos(latRad)
        ctx.ellipse(cx, cy + yOffset, radiusAtLat, radiusAtLat * Math.abs(Math.sin(rotX)) + 0.1, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 3. Matriz de pontos dos continentes (Dotted continents)
      const sinRotX = Math.sin(rotX)
      const cosRotX = Math.cos(rotX)

      for (let i = 0; i < CONTINENT_DOTS.length; i++) {
        const dot = CONTINENT_DOTS[i]
        const deltaLam = dot.lam - rotY

        // Projeção ortográfica tridimensional
        const x3d = R * Math.cos(dot.phi) * Math.sin(deltaLam)
        const y3d = R * (cosRotX * Math.sin(dot.phi) - sinRotX * Math.cos(dot.phi) * Math.cos(deltaLam))
        const z3d = sinRotX * Math.sin(dot.phi) + cosRotX * Math.cos(dot.phi) * Math.cos(deltaLam)

        // Se estiver na face frontal (visível)
        if (z3d > 0.05) {
          const px = cx + x3d
          const py = cy - y3d
          const dotRadius = Math.max(1.2, 2.3 * zoom * Math.min(1.2, z3d + 0.2))

          // Brilho ciano com desvanecimento suave nas bordas
          const alpha = Math.min(0.9, Math.max(0.12, z3d * 0.95))
          ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 4. Borda de sombra interna para reforçar profundidade 3D
      const rimGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R)
      rimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
      rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
      ctx.fillStyle = rimGrad
      ctx.fill()

      ctx.restore() // Remove clip do oceano

      // Anel sutil de contorno do globo
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()

      // 5. Pontos Ao Vivo (Pings de Visitantes e Pedidos)
      const now = Date.now()
      let foundHover: CityLocation | null = null

      for (const city of cities) {
        const phi = (city.lat * Math.PI) / 180
        const lam = (city.lng * Math.PI) / 180
        const deltaLam = lam - rotY

        const x3d = R * Math.cos(phi) * Math.sin(deltaLam)
        const y3d = R * (cosRotX * Math.sin(phi) - sinRotX * Math.cos(phi) * Math.cos(deltaLam))
        const z3d = sinRotX * Math.sin(phi) + cosRotX * Math.cos(phi) * Math.cos(deltaLam)

        if (z3d > 0.08) {
          const px = cx + x3d
          const py = cy - y3d

          const isRecentOrder = city.recentOrder && (now - (city.recentOrder.total || 0) < 60000)
          const isSelected = selectedStateFilter === city.state

          // Detecção de hover do mouse
          const distToMouse = Math.hypot(lastMousePosRef.current.x - px, lastMousePosRef.current.y - py)
          if (distToMouse < 18) {
            foundHover = city
          }

          // Ondas de radar pulsantes concêntricas
          const pulseSpeed = 1600
          const phase1 = (now % pulseSpeed) / pulseSpeed
          const phase2 = ((now + 800) % pulseSpeed) / pulseSpeed

          const maxRadius = isRecentOrder || isSelected ? 26 * zoom : 20 * zoom

          // Anel 1
          const r1 = 4 + phase1 * maxRadius
          const a1 = (1 - phase1) * (isRecentOrder ? 0.9 : 0.7)
          ctx.strokeStyle = isRecentOrder ? `rgba(168, 85, 247, ${a1})` : `rgba(0, 240, 255, ${a1})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(px, py, r1, 0, Math.PI * 2)
          ctx.stroke()

          // Anel 2
          const r2 = 4 + phase2 * maxRadius
          const a2 = (1 - phase2) * (isRecentOrder ? 0.9 : 0.7)
          ctx.strokeStyle = isRecentOrder ? `rgba(168, 85, 247, ${a2})` : `rgba(0, 240, 255, ${a2})`
          ctx.beginPath()
          ctx.arc(px, py, r2, 0, Math.PI * 2)
          ctx.stroke()

          // Ponto central luminoso
          const coreRadius = isRecentOrder ? 6 * zoom : 4.5 * zoom
          ctx.fillStyle = isRecentOrder ? '#c084fc' : '#38bdf8'
          ctx.beginPath()
          ctx.arc(px, py, coreRadius, 0, Math.PI * 2)
          ctx.fill()

          // Centro branco
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(px, py, coreRadius * 0.5, 0, Math.PI * 2)
          ctx.fill()

          // Rótulo discreto de cidade se estiver em foco ou no topo da visualização
          if (z3d > 0.45 || isSelected || foundHover?.city === city.city) {
            ctx.font = '600 11px Montserrat, sans-serif'
            ctx.fillStyle = isRecentOrder ? '#f3e8ff' : '#e0f2fe'
            ctx.textAlign = 'center'
            ctx.fillText(city.city, px, py - (coreRadius + 8))
          }
        }
      }

      setHoveredCity(foundHover)

      ctx.restore()
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [autoRotate, zoom, cities, selectedStateFilter])

  // Controles de mouse para girar o globo
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setAutoRotate(false)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      lastMousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    if (!isDraggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    rotYRef.current += dx * 0.006
    // Limita inclinação para não virar de cabeça para baixo
    rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current + dy * 0.006))

    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  // Controles de touch para mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setAutoRotate(false)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - dragStartRef.current.x
    const dy = e.touches[0].clientY - dragStartRef.current.y

    rotYRef.current += dx * 0.007
    rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current + dy * 0.007))

    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = () => {
    isDraggingRef.current = false
  }

  // Ranking dos Top Estados
  const topStates = useMemo(() => {
    return [
      { uf: 'SP', name: 'São Paulo', percent: 44, sessions: 1063, live: 7, orders: 14 },
      { uf: 'RJ', name: 'Rio de Janeiro', percent: 19, sessions: 459, live: 3, orders: 6 },
      { uf: 'MG', name: 'Minas Gerais', percent: 13, sessions: 314, live: 2, orders: 4 },
      { uf: 'PR', name: 'Paraná', percent: 9, sessions: 217, live: 2, orders: 3 },
      { uf: 'RS', name: 'Rio Grande do Sul', percent: 7, sessions: 169, live: 1, orders: 2 },
      { uf: 'SC', name: 'Santa Catarina', percent: 5, sessions: 121, live: 1, orders: 1 },
      { uf: 'Outros', name: 'Demais Estados', percent: 3, sessions: 75, live: 1, orders: 1 },
    ]
  }, [])

  // Produtos em alta no momento
  const trendingProducts = useMemo(() => {
    return [
      {
        name: 'Sérum Facial Vitamina C 15%',
        price: 189.90,
        activeShoppers: 6,
        salesToday: 14,
        image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=200&auto=format&fit=crop&q=80',
      },
      {
        name: 'Combo Pele Radiante Glow Premium',
        price: 297.00,
        activeShoppers: 3,
        salesToday: 9,
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&auto=format&fit=crop&q=80',
      },
      {
        name: 'Espuma de Limpeza Profunda Facial',
        price: 98.50,
        activeShoppers: 4,
        salesToday: 8,
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200&auto=format&fit=crop&q=80',
      },
    ]
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header do Live View no estilo Shopify */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card2) 100%)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
            }}
          >
            <Globe size={22} />
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                Live View • Tempo Real
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 99,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                AO VIVO
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              {liveTime || 'Atualizando em tempo real'}
            </div>
          </div>
        </div>

        {/* Legenda de cores e busca rápida */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#a855f7',
                  boxShadow: '0 0 6px #a855f7',
                }}
              />
              Pedidos Recentes
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#38bdf8',
                  boxShadow: '0 0 6px #38bdf8',
                }}
              />
              Visitantes Online
            </span>
          </div>

          {/* Campo de busca de localização */}
          <form onSubmit={handleSearch} style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-2)',
              }}
            />
            <input
              type="text"
              placeholder="Buscar cidade ou estado..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px 6px 30px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-1)',
                fontSize: 12,
                outline: 'none',
                width: 190,
              }}
            />
          </form>
        </div>
      </div>

      {/* 2. Grid Principal: Coluna Esquerda (KPIs Shopify) + Coluna Direita (Globo 3D Interativo) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        {/* Coluna Esquerda: Cartões de Métricas Shopify */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card 1: Visitantes Agora */}
          <div
            className="card"
            style={{
              padding: '16px 20px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)' }}>
                Visitantes Agora
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <Eye size={13} />
                <span>Navegando</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: '#38bdf8', lineHeight: 1 }}>
                {visitorsOnline}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                pessoas navegando na loja neste instante
              </span>
            </div>
            {/* Barra de atividade ao vivo */}
            <div
              style={{
                height: 4,
                width: '100%',
                background: 'var(--bg-card2)',
                borderRadius: 2,
                overflow: 'hidden',
                marginTop: 4,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (visitorsOnline / 30) * 100)}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>

          {/* Cards em Dupla: Vendas Hoje & Pedidos Hoje */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Vendas Hoje */}
            <div className="card" style={{ padding: '16px 18px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)' }}>
                  Vendas Hoje
                </span>
                <DollarSign size={16} color="var(--green)" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', lineHeight: 1.2 }}>
                {fmtMoney(totalSalesToday, currency)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                Meta diária: 82% atingida
              </div>
              <div style={{ height: 3, width: '100%', background: 'var(--bg-card2)', borderRadius: 2, marginTop: 6 }}>
                <div style={{ height: '100%', width: '82%', background: 'var(--green)', borderRadius: 2 }} />
              </div>
            </div>

            {/* Pedidos Hoje */}
            <div className="card" style={{ padding: '16px 18px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)' }}>
                  Pedidos Hoje
                </span>
                <ShoppingBag size={16} color="var(--accent-dim)" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>
                {totalOrdersToday}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                Ticket Médio: {fmtMoney(totalOrdersToday > 0 ? totalSalesToday / totalOrdersToday : 0, currency)}
              </div>
              <div style={{ height: 3, width: '100%', background: 'var(--bg-card2)', borderRadius: 2, marginTop: 6 }}>
                <div style={{ height: '100%', width: '75%', background: 'var(--accent-dim)', borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {/* Sessões Hoje */}
          <div className="card" style={{ padding: '14px 18px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)' }}>
                Sessões Hoje
              </span>
              <TrendingUp size={15} color="var(--text-2)" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
                {totalSessionsToday.toLocaleString('pt-BR')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                +14.2% vs ontem
              </span>
            </div>
          </div>

          {/* Customer Behavior (Funil em Tempo Real - 10 min) exatamente como Shopify */}
          <div
            className="card"
            style={{
              padding: '16px 20px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)' }}>
                Comportamento do Cliente
              </span>
              <span
                style={{
                  fontSize: 10,
                  background: 'var(--bg-card2)',
                  color: 'var(--text-2)',
                  padding: '2px 6px',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Últimos 10 min
              </span>
            </div>

            {/* Pipeline visual com nós conectados no estilo Shopify */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 8px 8px 8px',
              }}
            >
              {/* Linha conectora de fundo */}
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  left: '12%',
                  right: '12%',
                  height: 3,
                  background: 'linear-gradient(90deg, #38bdf8, #818cf8, #a855f7, #10b981)',
                  zIndex: 0,
                  opacity: 0.6,
                }}
              />

              {/* Nó 1: Ativos */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#38bdf8',
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.7)',
                    border: '3px solid var(--bg-card)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                  {behaviorVisiting}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>
                  Visitando
                </span>
              </div>

              {/* Nó 2: Carrinho */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#818cf8',
                    boxShadow: '0 0 12px rgba(129, 140, 248, 0.7)',
                    border: '3px solid var(--bg-card)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                  {behaviorCart}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>
                  No Carrinho
                </span>
              </div>

              {/* Nó 3: Checkout */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#a855f7',
                    boxShadow: '0 0 12px rgba(168, 85, 247, 0.7)',
                    border: '3px solid var(--bg-card)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                  {behaviorCheckout}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>
                  Checkout
                </span>
              </div>

              {/* Nó 4: Compraram */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.7)',
                    border: '3px solid var(--bg-card)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>
                  {behaviorPurchased}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>
                  Compraram
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: O Mundinho 3D Interativo (Canvas Dotted Globe) */}
        <div
          className="card"
          style={{
            position: 'relative',
            minHeight: 460,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'radial-gradient(circle at 50% 50%, #0d1527 0%, #060a14 100%)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            cursor: isDraggingRef.current ? 'grabbing' : 'grab',
          }}
        >
          {/* Canvas WebGL/2D do Globo */}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 460,
              display: 'block',
            }}
          />

          {/* Banner de Pedido em Tempo Real flutuante no Globo */}
          {activeOrderBeacon && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: 10,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 20px rgba(168, 85, 247, 0.25)',
                pointerEvents: 'none',
                animation: 'fade-in 0.4s ease-out',
                maxWidth: 280,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#a855f7',
                  boxShadow: '0 0 10px #a855f7',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>
                  Novo Pedido • {activeOrderBeacon.city}, {activeOrderBeacon.state}
                </span>
                <span style={{ fontSize: 12, color: '#ffffff', fontWeight: 600 }}>
                  {activeOrderBeacon.product} ({fmtMoney(activeOrderBeacon.value, currency)})
                </span>
              </div>
            </div>
          )}

          {/* Tooltip do ponto em hover */}
          {hoveredCity && (
            <div
              style={{
                position: 'absolute',
                bottom: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.90)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12,
                color: '#ffffff',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              <MapPin size={15} color="#38bdf8" />
              <div>
                <div style={{ fontWeight: 700 }}>{hoveredCity.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {hoveredCity.visitors} visitante(s) online • Origem: {hoveredCity.channel}
                </div>
              </div>
            </div>
          )}

          {/* Controles flutuantes de câmera / rotação (canto inferior direito) */}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              right: 14,
              display: 'flex',
              gap: 6,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              padding: 4,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <button
              type="button"
              onClick={() => focusOnCoordinates(-14.235, -51.9253)}
              title="Centrar no Brasil"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              🇧🇷 Brasil
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate(prev => !prev)}
              title={autoRotate ? 'Pausar rotação' : 'Girar automaticamente'}
              style={{
                background: autoRotate ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: 'none',
                color: autoRotate ? '#38bdf8' : '#94a3b8',
                padding: 6,
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {autoRotate ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(1.5, z + 0.15))}
              title="Aproximar (+)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: 6,
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.75, z - 0.15))}
              title="Afastar (-)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: 6,
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ZoomOut size={14} />
            </button>
          </div>

          {/* Dica de arrastar no canto superior direito */}
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.4)',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '4px 8px',
              borderRadius: 6,
              pointerEvents: 'none',
            }}
          >
            Arraste para girar o globo
          </div>
        </div>
      </div>

      {/* Chips Rápidos de Estados Brasileiros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          Filtrar no Globo:
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectedStateFilter(null)
            focusOnCoordinates(-14.235, -51.9253)
          }}
          className={selectedStateFilter === null ? 'btn-filter-chip-active' : 'btn-filter-chip'}
          style={{
            padding: '5px 12px',
            fontSize: 12,
            borderRadius: 99,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: selectedStateFilter === null ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: selectedStateFilter === null ? 'var(--accent-dim)' : 'var(--text-2)',
            fontWeight: selectedStateFilter === null ? 700 : 500,
          }}
        >
          🇧🇷 Todos os Estados
        </button>
        {topStates
          .filter(s => s.uf !== 'Outros')
          .map(st => {
            const isSelected = selectedStateFilter === st.uf
            return (
              <button
                key={st.uf}
                type="button"
                onClick={() => handleSelectState(st.uf)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  borderRadius: 99,
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--accent-dim)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--accent-soft)' : 'var(--bg-card)',
                  color: isSelected ? 'var(--accent-dim)' : 'var(--text-1)',
                  fontWeight: isSelected ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{st.uf}</span>
                <span
                  style={{
                    fontSize: 10,
                    background: 'var(--bg-card2)',
                    padding: '1px 5px',
                    borderRadius: 8,
                    color: 'var(--text-2)',
                  }}
                >
                  {st.live} online
                </span>
              </button>
            )
          })}
      </div>

      {/* 3. Seção Inferior: Analytics de Estados, Feed de Pedidos em Tempo Real e Produtos em Alta */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        {/* Card: Top Estados / Localizações */}
        <div
          className="card"
          style={{
            padding: '18px 20px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Compass size={18} color="var(--accent-dim)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                Top Estados por Acesso
              </h3>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Sessões hoje</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topStates.map((st, idx) => (
              <div
                key={st.uf}
                onClick={() => st.uf !== 'Outros' && handleSelectState(st.uf)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: st.uf !== 'Outros' ? 'pointer' : 'default',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: selectedStateFilter === st.uf ? 'var(--accent-soft)' : 'transparent',
                  transition: 'background 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-2)', width: 14 }}>{idx + 1}.</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                      {st.name} ({st.uf})
                    </span>
                    {st.live > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.1)',
                          padding: '1px 6px',
                          borderRadius: 8,
                          fontWeight: 700,
                        }}
                      >
                        {st.live} online
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{st.sessions} sessões</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-1)', width: 32, textAlign: 'right' }}>
                      {st.percent}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 4, width: '100%', background: 'var(--bg-card2)', borderRadius: 2 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${st.percent}%`,
                      background: idx === 0 ? 'var(--accent-dim)' : 'var(--border-input)',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card: Feed de Atividades ao Vivo (Resumo de Pedidos & Ações) */}
        <div
          className="card"
          style={{
            padding: '18px 20px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} color="var(--amber)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                Feed em Tempo Real
              </h3>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: 'var(--text-2)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              Atualizando
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 330,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {events.map(ev => {
              const isOrder = ev.type === 'order'
              const isCheckout = ev.type === 'checkout'
              const isCart = ev.type === 'cart'

              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isOrder
                      ? 'rgba(168, 85, 247, 0.08)'
                      : 'var(--bg-card2)',
                    border: isOrder
                      ? '1px solid rgba(168, 85, 247, 0.25)'
                      : '1px solid var(--border-soft)',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: isOrder
                        ? 'rgba(168, 85, 247, 0.2)'
                        : isCheckout
                        ? 'rgba(56, 189, 248, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                      color: isOrder
                        ? '#a855f7'
                        : isCheckout
                        ? '#0284c7'
                        : '#d97706',
                    }}
                  >
                    {isOrder ? (
                      <ShoppingBag size={14} />
                    ) : isCheckout ? (
                      <CreditCard size={14} />
                    ) : isCart ? (
                      <ShoppingCart size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isOrder ? '#a855f7' : 'var(--text-1)',
                        }}
                      >
                        {ev.title}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ev.timeAgo}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-2)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ev.description}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 10,
                        color: 'var(--text-3)',
                        marginTop: 4,
                      }}
                    >
                      <span>📍 {ev.city}, {ev.state}</span>
                      <span>•</span>
                      <span>Origem: {ev.channel}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Card: Produtos em Alta no Momento */}
        <div
          className="card"
          style={{
            padding: '18px 20px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={18} color="var(--red)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                Produtos em Alta Agora
              </h3>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Mais vistos e comprados</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {trendingProducts.map((p, idx) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-card2)',
                  border: '1px solid var(--border-soft)',
                }}
              >
                <img
                  src={p.image}
                  alt={p.name}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    objectFit: 'cover',
                    border: '1px solid var(--border)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>
                    {fmtMoney(p.price, currency)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 10,
                      color: 'var(--text-2)',
                      marginTop: 3,
                    }}
                  >
                    <span style={{ color: '#0284c7', fontWeight: 600 }}>
                      🛒 {p.activeShoppers} no carrinho
                    </span>
                    <span>•</span>
                    <span>{p.salesToday} vendas hoje</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
