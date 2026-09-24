'use client'

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  Globe,
  Filter,
  Search,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Compass,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  MapPin,
  Zap,
  Flame,
  Check,
  ChevronDown,
  Sparkles,
  X,
  ExternalLink,
  Eye,
} from 'lucide-react'

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

interface FlightArc {
  id: string
  fromCity: string
  toCity: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  progress: number // 0 to 1
  speed: number
  product: string
  value: number
  color: string
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

interface EcommerceLiveViewProps {
  initialRevenue?: number
  initialOrdersCount?: number
  currency?: string
  clientSlug?: string
}

function fmtMoney(v: number, cur = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v)
}

// Cidades ativas pré-configuradas (foco Brasil + hubs internacionais)
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

// Geração de alta fidelidade dos continentes com densidade precisa (estilo Shopify Live View)
const CONTINENT_DOTS: { lat: number; lng: number; phi: number; lam: number }[] = (() => {
  const landBoxes = [
    // América do Sul (Brasil destacado com costa e interior detalhados)
    { lat1: -55, lat2: 12, lng1: -81, lng2: -34, test: (lat: number, lng: number) => {
      if (lat > 8 && lng < -73) return false
      if (lat > 2 && lng > -50 && lat > 5) return false
      if (lat < -40 && lng > -62) return false
      if (lat < -20 && lng > -38) return false
      if (lat < -10 && lng > -35) return false
      if (lat > -10 && lat < 5 && lng > -48 && lng < -40 && lat > -2) return true
      if (lat < -15 && lng < -74 && lat > -45) return false
      return true
    }},
    // América Central e Caribe
    { lat1: 8, lat2: 22, lng1: -105, lng2: -75, test: (lat: number, lng: number) => {
      if (lat > 16 && lng < -95 && lat > 18 && lng > -90) return false
      return Math.abs(lat - ((-0.4 * lng) - 25)) < 12
    }},
    // América do Norte
    { lat1: 24, lat2: 70, lng1: -168, lng2: -52, test: (lat: number, lng: number) => {
      if (lat < 30 && lng > -82) return false
      if (lat > 24 && lat < 30 && lng < -105) return false
      if (lat > 50 && lng > -55) return false
      if (lat < 48 && lng < -125) return false
      if (lat > 30 && lat < 45 && lng > -70) return false
      return true
    }},
    // Europa
    { lat1: 36, lat2: 71, lng1: -10, lng2: 45, test: (lat: number, lng: number) => {
      if (lat < 44 && lng > 30) return false
      if (lat < 38 && lng < -6) return false
      if (lat > 55 && lng < 4 && lat < 58 && lng > -4) return false
      return true
    }},
    // África
    { lat1: -35, lat2: 37, lng1: -18, lng2: 52, test: (lat: number, lng: number) => {
      if (lat > 20 && lng < -16) return false
      if (lat < 4 && lng < 8 && lat > -12) return false
      if (lat < -20 && lng < 14) return false
      if (lat < -30 && lng > 33) return false
      if (lat > 12 && lng > 44 && lat < 28) return false
      return true
    }},
    // Ásia
    { lat1: 2, lat2: 75, lng1: 45, lng2: 150, test: (lat: number, lng: number) => {
      if (lat < 10 && lng < 98) return false
      if (lat < 22 && lng < 60) return false
      if (lat > 5 && lat < 24 && lng > 65 && lng < 72) return false
      if (lat > 5 && lat < 22 && lng > 80 && lng < 95) return false
      return true
    }},
    // Oceania / Austrália / NZ
    { lat1: -44, lat2: -10, lng1: 112, lng2: 155, test: (lat: number, lng: number) => {
      if (lat < -38 && lng < 140) return false
      return true
    }},
    { lat1: -47, lat2: -34, lng1: 166, lng2: 178, test: () => true },
  ]

  const dots: { lat: number; lng: number; phi: number; lam: number }[] = []
  const step = 2.8
  for (const b of landBoxes) {
    for (let lat = b.lat1; lat <= b.lat2; lat += step) {
      for (let lng = b.lng1; lng <= b.lng2; lng += step) {
        if (b.test(lat, lng)) {
          dots.push({
            lat,
            lng,
            phi: (lat * Math.PI) / 180,
            lam: (lng * Math.PI) / 180,
          })
        }
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
  // Container para Fullscreen
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Relógio ao vivo
  const [liveTime, setLiveTime] = useState('')

  // Métricas em tempo real
  const [visitorsOnline, setVisitorsOnline] = useState(18)
  const [totalSalesToday, setTotalSalesToday] = useState(initialRevenue)
  const [totalOrdersToday, setTotalOrdersToday] = useState(initialOrdersCount)
  const [totalSessionsToday, setTotalSessionsToday] = useState(2418)

  // Funil de Comportamento (10 min)
  const [behaviorVisiting, setBehaviorVisiting] = useState(18)
  const [behaviorCart, setBehaviorCart] = useState(6)
  const [behaviorCheckout, setBehaviorCheckout] = useState(3)
  const [behaviorPurchased, setBehaviorPurchased] = useState(4)

  // Cidades e eventos
  const [cities, setCities] = useState<CityLocation[]>(INITIAL_CITIES)
  const [selectedStateFilter, setSelectedStateFilter] = useState<string | null>(null)
  const [showFilterPopover, setShowFilterPopover] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const filterPopoverRef = useRef<HTMLDivElement>(null)

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

  // Arcos 3D animados de transação
  const flightArcsRef = useRef<FlightArc[]>([
    {
      id: 'arc-1',
      fromCity: 'Curitiba',
      toCity: 'São Paulo',
      fromLat: -25.4290,
      fromLng: -49.2671,
      toLat: -23.5505,
      toLng: -46.6333,
      progress: 0.35,
      speed: 0.007,
      product: 'Sérum Facial Vitamina C',
      value: 189.90,
      color: '#a855f7',
    },
    {
      id: 'arc-2',
      fromCity: 'Rio de Janeiro',
      toCity: 'São Paulo',
      fromLat: -22.9068,
      fromLng: -43.1729,
      toLat: -23.5505,
      toLng: -46.6333,
      progress: 0.8,
      speed: 0.009,
      product: 'Combo Pele Radiante',
      value: 297.00,
      color: '#00f0ff',
    },
  ])

  // Feed de eventos ao vivo
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
      timeAgo: 'há 10s',
      timestamp: Date.now() - 10000,
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
      timeAgo: 'há 38s',
      timestamp: Date.now() - 38000,
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
      timestamp: Date.now() - 70000,
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
      timestamp: Date.now() - 110000,
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
      timestamp: Date.now() - 140000,
    },
  ])

  // Busca rápida de localização
  const [searchQuery, setSearchQuery] = useState('')

  // Controles do Globo 3D
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const [zoom, setZoom] = useState(1.05)

  // Física de rotação: inércia e amortecimento suave
  const rotYRef = useRef(-0.84) // Longitude centrada no Brasil (~-48°)
  const rotXRef = useRef(-0.25) // Tilt / Latitude (~-15°)
  const velXRef = useRef(0)
  const velYRef = useRef(0)
  const targetRotRef = useRef<{ x: number; y: number } | null>(null)

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const lastDragTimeRef = useRef(0)

  // Relógio em tempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setLiveTime(
        now.toLocaleString('pt-BR', {
          day: '2-digit',
          month: 'short',
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

  // Fechar popover de filtro ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setShowFilterPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Simulador de atividade ao vivo
  useEffect(() => {
    const interval = setInterval(() => {
      // Flutuação orgânica dos visitantes online
      setVisitorsOnline(prev => {
        const delta = Math.floor(Math.random() * 3) - 1
        const next = Math.max(14, Math.min(26, prev + delta))
        setBehaviorVisiting(next)
        return next
      })

      setTotalSessionsToday(prev => prev + (Math.random() > 0.4 ? 1 : 0))
      setBehaviorCart(prev => Math.max(4, Math.min(10, prev + (Math.random() > 0.5 ? 1 : -1))))
      setBehaviorCheckout(prev => Math.max(2, Math.min(6, prev + (Math.random() > 0.6 ? 1 : -1))))

      // Dispara novas transações ou eventos
      const roll = Math.random()
      const availableCities = INITIAL_CITIES.filter(c => c.state !== 'PT' && c.state !== 'EUA')
      const targetCity = availableCities[Math.floor(Math.random() * availableCities.length)]

      if (roll < 0.28) {
        // Novo pedido aprovado!
        const products = [
          { name: 'Sérum Facial Vitamina C 15%', price: 189.90 },
          { name: 'Combo Pele Radiante Glow', price: 297.00 },
          { name: 'Espuma Facial Purificante', price: 98.50 },
          { name: 'Hidratante Noturno Reparador', price: 149.00 },
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

        // Cria arco 3D de transação voando até a sede
        flightArcsRef.current.push({
          id: `arc-${Date.now()}`,
          fromCity: targetCity.city,
          toCity: 'São Paulo',
          fromLat: targetCity.lat,
          fromLng: targetCity.lng,
          toLat: -23.5505,
          toLng: -46.6333,
          progress: 0,
          speed: 0.008 + Math.random() * 0.004,
          product: prod.name,
          value: prod.price,
          color: '#a855f7',
        })

        // Adiciona evento ao feed
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
      } else if (roll < 0.58) {
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
      } else if (roll < 0.85) {
        // Adicionou ao carrinho
        const newEv: LiveEvent = {
          id: `ev-${Date.now()}`,
          type: 'cart',
          title: 'Adicionou ao Carrinho',
          description: 'Produto inserido na sacola de compras',
          city: targetCity.city,
          state: targetCity.state,
          channel: targetCity.channel,
          timeAgo: 'agora',
          timestamp: Date.now(),
        }
        setEvents(prev => [newEv, ...prev.slice(0, 14)])
      }
    }, 4200)

    return () => clearInterval(interval)
  }, [currency])

  // Rotação suave da câmera até uma coordenada específica
  const focusOnCoordinates = useCallback((lat: number, lng: number) => {
    setAutoRotate(false)
    velXRef.current = 0
    velYRef.current = 0
    const targetY = -(lng * Math.PI) / 180
    const targetX = -(lat * Math.PI) / 180 * 0.75
    targetRotRef.current = { x: targetX, y: targetY }
  }, [])

  // Seleção de estado via popover
  const handleSelectState = (st: string) => {
    if (selectedStateFilter === st) {
      setSelectedStateFilter(null)
      focusOnCoordinates(-14.235, -51.9253)
    } else {
      setSelectedStateFilter(st)
      const match = cities.find(c => c.state === st)
      if (match) {
        focusOnCoordinates(match.lat, match.lng)
      }
    }
    setShowFilterPopover(false)
  }

  // Busca rápida de localização
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

  // Alterna tela cheia
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  // -------------------------------------------------------------
  // ENGINE 3D DO GLOBO INTERATIVO (CANVAS 60FPS)
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number

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

      // Animação de rotação: Target suave ou Inércia com amortecimento
      if (targetRotRef.current) {
        const dx = targetRotRef.current.x - rotXRef.current
        const dy = targetRotRef.current.y - rotYRef.current
        rotXRef.current += dx * 0.09
        rotYRef.current += dy * 0.09
        if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) {
          targetRotRef.current = null
        }
      } else if (!isDraggingRef.current) {
        // Aplica velocidade residual (física de inércia)
        if (Math.abs(velXRef.current) > 0.0001 || Math.abs(velYRef.current) > 0.0001) {
          rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current + velXRef.current))
          rotYRef.current += velYRef.current
          velXRef.current *= 0.92
          velYRef.current *= 0.92
        } else if (autoRotate) {
          rotYRef.current += 0.0022
        }
      }

      const cx = width / 2
      const cy = height / 2
      // Tamanho expansivo do globo para preencher elegantemente o espaço da tela
      const baseRadius = Math.min(width * 0.44, height * 0.46)
      const R = baseRadius * zoom

      const rotX = rotXRef.current
      const rotY = rotYRef.current
      const sinRotX = Math.sin(rotX)
      const cosRotX = Math.cos(rotX)

      // Identifica se o tema atual é dark ou light
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)

      // 1. Sombra suave de contato no chão (Drop shadow tridimensional)
      const shadowY = cy + R * 0.92
      const shadowGrad = ctx.createRadialGradient(cx, shadowY, R * 0.2, cx, shadowY, R * 0.85)
      shadowGrad.addColorStop(0, isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.16)')
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = shadowGrad
      ctx.beginPath()
      ctx.ellipse(cx, shadowY, R * 0.85, R * 0.18, 0, 0, Math.PI * 2)
      ctx.fill()

      // 2. Halo de atmosfera externa luminosa (Corona)
      const atmosphereGrad = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.18)
      if (isDark) {
        atmosphereGrad.addColorStop(0, 'rgba(56, 189, 248, 0.32)')
        atmosphereGrad.addColorStop(0.45, 'rgba(99, 102, 241, 0.12)')
        atmosphereGrad.addColorStop(1, 'rgba(56, 189, 248, 0)')
      } else {
        atmosphereGrad.addColorStop(0, 'rgba(34, 211, 238, 0.38)')
        atmosphereGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.14)')
        atmosphereGrad.addColorStop(1, 'rgba(14, 165, 233, 0)')
      }
      ctx.fillStyle = atmosphereGrad
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2)
      ctx.fill()

      // 3. Esfera do Oceano (Globo Cristalino Estilo Shopify)
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      // Gradiente esférico realista com iluminação especular no topo esquerdo
      const oceanGrad = ctx.createRadialGradient(
        cx - R * 0.38,
        cy - R * 0.38,
        R * 0.05,
        cx,
        cy,
        R
      )
      if (isDark) {
        oceanGrad.addColorStop(0, '#1e293b') // Especular suave
        oceanGrad.addColorStop(0.35, '#0f172a') // Profundeza
        oceanGrad.addColorStop(0.75, '#080d1a')
        oceanGrad.addColorStop(1, '#020617') // Limb escuro
      } else {
        oceanGrad.addColorStop(0, '#ffffff') // Brilho puro de vidro
        oceanGrad.addColorStop(0.25, '#f0fdfa') // Ciano leitoso
        oceanGrad.addColorStop(0.65, '#e0f2fe') // Oceano gelo
        oceanGrad.addColorStop(0.9, '#bae6fd') // Borda azulada
        oceanGrad.addColorStop(1, '#7dd3fc')
      }
      ctx.fillStyle = oceanGrad
      ctx.fill()

      // Paralelos e Meridianos finos (Graticule)
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(14, 165, 233, 0.12)'
      ctx.lineWidth = 1
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath()
        const latRad = (lat * Math.PI) / 180
        const yOffset = -R * Math.sin(latRad) * Math.cos(rotX)
        const radiusAtLat = R * Math.cos(latRad)
        ctx.ellipse(cx, cy + yOffset, radiusAtLat, radiusAtLat * Math.abs(Math.sin(rotX)) + 0.1, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 4. Matriz de Pontos dos Continentes (Hex/Dot Matrix)
      for (let i = 0; i < CONTINENT_DOTS.length; i++) {
        const dot = CONTINENT_DOTS[i]
        const deltaLam = dot.lam - rotY

        const x3d = R * Math.cos(dot.phi) * Math.sin(deltaLam)
        const y3d = R * (cosRotX * Math.sin(dot.phi) - sinRotX * Math.cos(dot.phi) * Math.cos(deltaLam))
        const z3d = sinRotX * Math.sin(dot.phi) + cosRotX * Math.cos(dot.phi) * Math.cos(deltaLam)

        if (z3d > 0.04) {
          const px = cx + x3d
          const py = cy - y3d
          const dotRadius = Math.max(1.1, 2.2 * zoom * Math.min(1.2, z3d + 0.2))

          // Brilho e opacidade de acordo com o ângulo de visão
          const alpha = Math.min(0.95, Math.max(0.12, z3d * 0.98))
          if (isDark) {
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`
          } else {
            // Em tema claro: ciano/esmeralda vibrante estilo Shopify
            ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.95})`
          }
          ctx.beginPath()
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Sombra de oclusão esférica interna (reforça volume 3D)
      const rimGrad = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R)
      rimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
      rimGrad.addColorStop(1, isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(2, 132, 199, 0.22)')
      ctx.fillStyle = rimGrad
      ctx.fill()

      ctx.restore() // Remove clip da esfera

      // Contorno fino cristalino da esfera
      ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(14, 165, 233, 0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()

      // 5. Arcos 3D Animados de Transações (Shopify Flight Arcs)
      const activeArcs = flightArcsRef.current
      for (let a = activeArcs.length - 1; a >= 0; a--) {
        const arc = activeArcs[a]
        arc.progress += arc.speed

        if (arc.progress >= 1) {
          activeArcs.splice(a, 1)
          continue
        }

        // Converte coordenadas geográficas dos dois pontos
        const phi1 = (arc.fromLat * Math.PI) / 180
        const lam1 = (arc.fromLng * Math.PI) / 180 - rotY
        const phi2 = (arc.toLat * Math.PI) / 180
        const lam2 = (arc.toLng * Math.PI) / 180 - rotY

        // Ponto A
        const ax = R * Math.cos(phi1) * Math.sin(lam1)
        const ay = R * (cosRotX * Math.sin(phi1) - sinRotX * Math.cos(phi1) * Math.cos(lam1))
        const az = sinRotX * Math.sin(phi1) + cosRotX * Math.cos(phi1) * Math.cos(lam1)

        // Ponto B
        const bx = R * Math.cos(phi2) * Math.sin(lam2)
        const by = R * (cosRotX * Math.sin(phi2) - sinRotX * Math.cos(phi2) * Math.cos(lam2))
        const bz = sinRotX * Math.sin(phi2) + cosRotX * Math.cos(phi2) * Math.cos(lam2)

        // Se ao menos um dos pontos estiver visível
        if (az > -0.1 || bz > -0.1) {
          const t = arc.progress
          // Interpolação com elevação parabólica 3D
          const arcHeight = Math.sin(Math.PI * t) * 45 * zoom
          const curX = ax + (bx - ax) * t
          const curY = ay + (by - ay) * t - arcHeight

          const pScreenX = cx + curX
          const pScreenY = cy - curY

          // Rastro do arco
          ctx.strokeStyle = arc.color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx + ax, cy - ay)
          ctx.quadraticCurveTo(cx + (ax + bx) / 2, cy - (ay + by) / 2 - arcHeight * 1.5, cx + bx, cy - by)
          ctx.globalAlpha = Math.sin(Math.PI * t) * 0.6
          ctx.stroke()
          ctx.globalAlpha = 1

          // Partícula de luz viajante
          ctx.fillStyle = '#ffffff'
          ctx.shadowColor = arc.color
          ctx.shadowBlur = 10
          ctx.beginPath()
          ctx.arc(pScreenX, pScreenY, 4 * zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      // 6. Pontos Ao Vivo (Pings de Visitantes e Pedidos com Pinos 3D)
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

          // Detecção de mouse hover
          const distToMouse = Math.hypot(lastMousePosRef.current.x - px, lastMousePosRef.current.y - py)
          if (distToMouse < 20) {
            foundHover = city
          }

          // Ondas de radar concêntricas (3 ondas contínuas de alta frequência)
          const pulseDuration = 1800
          const maxRadius = isRecentOrder || isSelected ? 32 * zoom : 24 * zoom

          for (let wave = 0; wave < 3; wave++) {
            const phase = ((now + wave * 600) % pulseDuration) / pulseDuration
            const waveR = 4 + phase * maxRadius
            const waveA = (1 - phase) * (isRecentOrder ? 0.9 : 0.75)

            ctx.strokeStyle = isRecentOrder
              ? `rgba(168, 85, 247, ${waveA})`
              : isDark
              ? `rgba(0, 240, 255, ${waveA})`
              : `rgba(6, 182, 212, ${waveA})`
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(px, py, waveR, 0, Math.PI * 2)
            ctx.stroke()
          }

          // Haste do pino tridimensional projetada para fora da superfície
          const nx = x3d / R
          const ny = y3d / R
          const pinHeight = 16 * zoom
          const pinTopX = px + nx * pinHeight
          const pinTopY = py - ny * pinHeight

          ctx.strokeStyle = isRecentOrder ? '#c084fc' : isDark ? '#38bdf8' : '#0284c7'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(pinTopX, pinTopY)
          ctx.stroke()

          // Esfera luminosa no topo do pino 3D
          const coreRadius = isRecentOrder ? 6 * zoom : 4.5 * zoom
          ctx.fillStyle = isRecentOrder ? '#a855f7' : isDark ? '#00f0ff' : '#06b6d4'
          ctx.shadowColor = isRecentOrder ? '#a855f7' : '#00f0ff'
          ctx.shadowBlur = 12
          ctx.beginPath()
          ctx.arc(pinTopX, pinTopY, coreRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0

          // Centro branco reluzente
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(pinTopX, pinTopY, coreRadius * 0.45, 0, Math.PI * 2)
          ctx.fill()

          // Rótulo da cidade quando em foco ou em evidência
          if (z3d > 0.45 || isSelected || foundHover?.city === city.city) {
            ctx.font = '600 11px Montserrat, sans-serif'
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a'
            ctx.textAlign = 'center'
            ctx.fillText(city.city, pinTopX, pinTopY - (coreRadius + 8))
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

  // -------------------------------------------------------------
  // CONTROLES DE MOUSE / TOQUE COM INÉRCIA (MOMENTUM)
  // -------------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    lastDragTimeRef.current = performance.now()
    velXRef.current = 0
    velYRef.current = 0
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
    const now = performance.now()
    const dt = Math.max(1, now - lastDragTimeRef.current)
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    // Calcula velocidade para inércia
    velYRef.current = (dx * 0.006) / (dt * 0.1)
    velXRef.current = (dy * 0.006) / (dt * 0.1)

    rotYRef.current += dx * 0.006
    rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current + dy * 0.006))

    dragStartRef.current = { x: e.clientX, y: e.clientY }
    lastDragTimeRef.current = now
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      velXRef.current = 0
      velYRef.current = 0
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

  // Lista de estados para o Popover de Filtro (somente ícone, sem poluir a tela)
  const stateList = useMemo(() => {
    return [
      { uf: 'SP', name: 'São Paulo', live: 7, orders: 14, percent: 44, sessions: 1063 },
      { uf: 'RJ', name: 'Rio de Janeiro', live: 3, orders: 6, percent: 19, sessions: 459 },
      { uf: 'MG', name: 'Minas Gerais', live: 2, orders: 4, percent: 13, sessions: 314 },
      { uf: 'PR', name: 'Paraná', live: 2, orders: 3, percent: 9, sessions: 217 },
      { uf: 'RS', name: 'Rio Grande do Sul', live: 1, orders: 2, percent: 7, sessions: 169 },
      { uf: 'SC', name: 'Santa Catarina', live: 1, orders: 1, percent: 5, sessions: 121 },
      { uf: 'BA', name: 'Bahia', live: 1, orders: 1, percent: 4, sessions: 98 },
      { uf: 'DF', name: 'Distrito Federal', live: 1, orders: 1, percent: 3, sessions: 85 },
      { uf: 'CE', name: 'Ceará', live: 1, orders: 1, percent: 3, sessions: 76 },
      { uf: 'GO', name: 'Goiás', live: 1, orders: 0, percent: 2, sessions: 54 },
      { uf: 'PE', name: 'Pernambuco', live: 1, orders: 0, percent: 2, sessions: 49 },
      { uf: 'ES', name: 'Espírito Santo', live: 1, orders: 0, percent: 2, sessions: 42 },
    ]
  }, [])

  const filteredStates = useMemo(() => {
    if (!filterSearch.trim()) return stateList
    const q = filterSearch.toLowerCase().trim()
    return stateList.filter(s => s.name.toLowerCase().includes(q) || s.uf.toLowerCase().includes(q))
  }, [stateList, filterSearch])

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
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        background: isFullscreen ? 'var(--bg)' : 'transparent',
        padding: isFullscreen ? 24 : 0,
        minHeight: isFullscreen ? '100vh' : 'auto',
      }}
    >
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

        {/* Legenda de cores oficial da Shopify */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#a855f7',
                boxShadow: '0 0 8px #a855f7',
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
                background: '#00f0ff',
                boxShadow: '0 0 8px #00f0ff',
              }}
            />
            Visitantes Online
          </span>
        </div>
      </div>

      {/* 2. Cenário Principal: Painel Esquerdo (Shopify Cards) + Palco do Globo 3D Fluido */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) 1fr',
          gap: 20,
          alignItems: 'stretch',
        }}
        className="live-view-stage"
      >
        {/* Painel Esquerdo: Cards Flutuantes de Métricas (Shopify Style) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card: Visitantes Agora */}
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
                  color: '#0284c7',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <Eye size={13} />
                <span>Navegando</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#0284c7', lineHeight: 1 }}>
                {visitorsOnline}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                pessoas ativas na loja
              </span>
            </div>
            {/* Barra de atividade orgânica */}
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
                  background: 'linear-gradient(90deg, #06b6d4, #0284c7)',
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
                Meta diária: 82%
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
                Ticket: {fmtMoney(totalOrdersToday > 0 ? totalSalesToday / totalOrdersToday : 0, currency)}
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

          {/* Comportamento do Cliente (Funil 10 min com Nós Conectados Shopify) */}
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

            {/* Pipeline de nós luminosos conectados */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 8px 8px 8px',
              }}
            >
              {/* Linha de conexão */}
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  left: '12%',
                  right: '12%',
                  height: 3,
                  background: 'linear-gradient(90deg, #06b6d4, #818cf8, #a855f7, #10b981)',
                  zIndex: 0,
                  opacity: 0.65,
                }}
              />

              {/* Nó 1: Visitando */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#06b6d4',
                    boxShadow: '0 0 12px rgba(6, 182, 212, 0.7)',
                    border: '3px solid var(--bg-card)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                  {behaviorVisiting}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
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
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  Carrinho
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
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
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
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  Compraram
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Palco do Globo 3D Fluido: Sem aspecto de caixa/iframe, integrado de forma cinematográfica */}
        <div
          style={{
            position: 'relative',
            minHeight: 560,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            background: 'radial-gradient(ellipse at 50% 50%, var(--bg-card) 0%, var(--bg) 100%)',
            border: '1px solid var(--border)',
            cursor: isDraggingRef.current ? 'grabbing' : 'grab',
          }}
        >
          {/* Canvas WebGL/2D de alta definição */}
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
              minHeight: 560,
              display: 'block',
            }}
          />

          {/* Barra Flutuante Superior da Shopify (Busca + Ícones de Ação) */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {/* Campo de Busca de Localização Flutuante */}
            <form
              onSubmit={handleSearch}
              style={{
                pointerEvents: 'auto',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 12,
                  color: 'var(--text-2)',
                }}
              />
              <input
                type="text"
                placeholder="Buscar localização..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px 8px 34px',
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-1)',
                  fontSize: 12,
                  outline: 'none',
                  width: 210,
                  boxShadow: 'var(--shadow-soft)',
                }}
              />
            </form>

            {/* Grupo de Botões Ícones Flutuantes (Shopify Icon Bar) */}
            <div
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* 1. Botão ÍCONE de Filtro com Popover Elegante */}
              <div style={{ position: 'relative' }} ref={filterPopoverRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterPopover(prev => !prev)}
                  title="Filtrar por estado / localização"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 99,
                    border: '1px solid',
                    borderColor: selectedStateFilter ? 'var(--accent-dim)' : 'var(--border)',
                    background: selectedStateFilter ? 'var(--accent-soft)' : 'var(--bg-card)',
                    color: selectedStateFilter ? 'var(--accent-dim)' : 'var(--text-1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-soft)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                >
                  <Filter size={16} />
                  {selectedStateFilter && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--accent-dim)',
                      }}
                    />
                  )}
                </button>

                {/* Popover Suspenso de Filtro por Estado */}
                {showFilterPopover && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 44,
                      right: 0,
                      width: 260,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.2)',
                      padding: 12,
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                        Filtrar no Globo
                      </span>
                      {selectedStateFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStateFilter(null)
                            focusOnCoordinates(-14.235, -51.9253)
                            setShowFilterPopover(false)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-dim)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Limpar filtro
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Pesquisar estado..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card2)',
                        color: 'var(--text-1)',
                        fontSize: 11,
                        outline: 'none',
                      }}
                    />

                    <div
                      style={{
                        maxHeight: 220,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStateFilter(null)
                          focusOnCoordinates(-14.235, -51.9253)
                          setShowFilterPopover(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: 'none',
                          background: selectedStateFilter === null ? 'var(--accent-soft)' : 'transparent',
                          color: selectedStateFilter === null ? 'var(--accent-dim)' : 'var(--text-1)',
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>🇧🇷 Todos os Estados</span>
                        {selectedStateFilter === null && <Check size={14} />}
                      </button>

                      {filteredStates.map(st => (
                        <button
                          key={st.uf}
                          type="button"
                          onClick={() => handleSelectState(st.uf)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: 'none',
                            background: selectedStateFilter === st.uf ? 'var(--accent-soft)' : 'transparent',
                            color: selectedStateFilter === st.uf ? 'var(--accent-dim)' : 'var(--text-1)',
                            cursor: 'pointer',
                            fontSize: 12,
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, width: 24 }}>{st.uf}</span>
                            <span>{st.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10,
                                background: 'var(--bg-card2)',
                                padding: '1px 5px',
                                borderRadius: 6,
                                color: 'var(--text-2)',
                              }}
                            >
                              {st.live} online
                            </span>
                            {selectedStateFilter === st.uf && <Check size={14} />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Botão Centrar no Brasil */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStateFilter(null)
                  focusOnCoordinates(-14.235, -51.9253)
                }}
                title="Centrar visualização no Brasil"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <Compass size={16} />
              </button>

              {/* 3. Botão Auto-Girar Play/Pause */}
              <button
                type="button"
                onClick={() => setAutoRotate(prev => !prev)}
                title={autoRotate ? 'Pausar rotação' : 'Girar automaticamente'}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  background: autoRotate ? 'var(--accent-soft)' : 'var(--bg-card)',
                  color: autoRotate ? 'var(--accent-dim)' : 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                {autoRotate ? <Pause size={15} /> : <Play size={15} />}
              </button>

              {/* 4. Botão Tela Cheia */}
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>

          {/* Banner Flutuante de Pedido Aprovado (Shopify Live Event Pop) */}
          {activeOrderBeacon && (
            <div
              style={{
                position: 'absolute',
                top: 70,
                left: 16,
                background: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(168, 85, 247, 0.45)',
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 8px 24px rgba(168, 85, 247, 0.3)',
                pointerEvents: 'none',
                animation: 'fade-in 0.3s ease-out',
                maxWidth: 290,
                zIndex: 10,
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

          {/* Tooltip flutuante ao passar o mouse sobre uma cidade */}
          {hoveredCity && (
            <div
              style={{
                position: 'absolute',
                bottom: 30,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 12,
                color: '#ffffff',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
                zIndex: 15,
              }}
            >
              <MapPin size={15} color="#00f0ff" />
              <div>
                <div style={{ fontWeight: 700 }}>{hoveredCity.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {hoveredCity.visitors} visitante(s) online • Origem: {hoveredCity.channel}
                </div>
              </div>
            </div>
          )}

          {/* Controles de Zoom Flutuantes (Shopify Pill no Canto Inferior Direito) */}
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-card)',
              borderRadius: 99,
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
              overflow: 'hidden',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(1.5, z + 0.12))}
              title="Aproximar (+)"
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-1)',
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.75, z - 0.12))}
              title="Afastar (-)"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-1)',
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZoomOut size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Seção Inferior: Analytics de Localização, Feed ao Vivo e Produtos em Alta */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        {/* Card: Top Estados por Acesso */}
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
            {stateList.slice(0, 6).map((st, idx) => (
              <div
                key={st.uf}
                onClick={() => handleSelectState(st.uf)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: 'pointer',
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
                          color: '#0284c7',
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

        {/* Card: Feed em Tempo Real (Resumo de Pedidos e Ações) */}
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
              Ao vivo
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

        {/* Card: Produtos em Alta Agora */}
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
            {trendingProducts.map(p => (
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
