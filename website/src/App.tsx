import { useState, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Eye,
  Github,
  Menu,
  MousePointer2,
  PackageCheck,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'

// TODO: replace with the official repository URL once the GitHub account is known.
const GITHUB_URL = ''

const persuasionItems = [
  { label: 'URGENCY', tone: 'red', text: '03:21 remaining' },
  { label: 'SCARCITY', tone: 'yellow', text: 'Only 3 left' },
  { label: 'SOCIAL PROOF', tone: 'blue', text: '87 people bought this' },
  { label: 'UPSELLING', tone: 'purple', text: 'People also bought' },
]

const SectionTag = ({ number, children }: { number: string; children: string }) => (
  <div className="section-tag"><span>{number}</span><span>{children}</span></div>
)

const ButtonLink = ({ children, primary = false, href = '#demo' }: { children: ReactNode; primary?: boolean; href?: string }) => (
  <a className={`button ${primary ? 'button-primary' : 'button-quiet'}`} href={href}>
    {children}
  </a>
)

function Navbar() {
  const [open, setOpen] = useState(false)
  const links = [['Why Dehype', '#problem'], ['How It Works', '#how-it-works'], ['Features', '#features'], ['Demo', '#demo']]
  return (
    <header className="navbar">
      <a className="brand" href="#top">DEHYPE<span>.</span></a>
      <nav className={open ? 'nav-links nav-open' : 'nav-links'}>
        {links.map(([label, href]) => <a key={label} href={href} onClick={() => setOpen(false)}>{label}</a>)}
        <a href={GITHUB_URL || '#open-source'} onClick={() => setOpen(false)}><Github size={15} /> GitHub</a>
      </nav>
      <div className="nav-actions"><ButtonLink primary>Try Dehype <ArrowRight size={15} /></ButtonLink></div>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
        {open ? <X size={21} /> : <Menu size={21} />}
      </button>
    </header>
  )
}

function BrowserMockup({ neutral = false, compact = false }: { neutral?: boolean; compact?: boolean }) {
  return (
    <div className={`browser ${compact ? 'browser-compact' : ''} ${neutral ? 'browser-neutral' : ''}`}>
      <div className="browser-bar"><div className="traffic-lights"><i /><i /><i /></div><div className="address">shop.example / audio / wireless-headphones</div><div className="browser-lock">⌁</div></div>
      <div className="shop-nav"><span className="shop-logo">shop<span>+</span></span><span className="shop-search">Search products</span><span className="shop-icon">♡</span><span className="shop-icon">▢</span></div>
      {neutral ? (
        <div className="product-clean">
          <div className="clean-image"><div className="headphone-shape" /><span className="product-index">01 / 04</span></div>
          <div className="clean-copy"><span className="eyebrow">AUDIO / WIRELESS</span><h4>QuietForm headphones</h4><p className="clean-price">$24.99</p><p className="spec-copy">Over-ear wireless headphones with 30-hour battery life and active noise cancellation.</p><div className="spec-row"><span>30 hr battery</span><span>USB-C charging</span></div><button className="clean-button">Add to cart <ArrowRight size={14} /></button></div>
        </div>
      ) : (
        <div className="product-page"><div className="product-image"><span className="sale-sticker">-70%</span><div className="headphone-shape" /><span className="image-dots">● ● ●</span></div><div className="product-copy"><div className="mini-stars">★★★★★ <small>(214)</small></div><h4>Wireless Headphones, Pro Edition</h4><div className="fake-price"><strong>$12.99</strong><del>$42.99</del></div><div className="pressure-line"><Clock3 size={13} /> 03:21 remaining</div><div className="stock-line"><span>Only 3 left</span><span>87 people bought this</span></div><button className="upgrade-button">Upgrade to Pro <Plus size={13} /></button><button className="cart-button">Add to cart</button><span className="recommend-line">People also bought ›</span></div></div>
      )}
      {!compact && <div className="annotation annotation-one"><span>URGENCY</span><b /></div>}
      {!compact && <div className="annotation annotation-two"><span>SCARCITY</span><b /></div>}
      {!compact && <div className="annotation annotation-three"><span>SOCIAL PROOF</span><b /></div>}
      {!compact && <div className="annotation annotation-four"><span>UPSELLING</span><b /></div>}
    </div>
  )
}

function Hero() {
  return <section className="hero section-pad" id="top"><div className="hero-copy reveal"><div className="kicker"><span className="kicker-dot" /> A decision observatory for the web</div><h1>You came to buy<br />one thing.<br /><em>Why did you leave with five?</em></h1><p>Dehype helps you see how shopping interfaces influence your decisions — before the decision is made.</p><div className="hero-actions"><ButtonLink primary>See How It Works <ArrowDownRight size={16} /></ButtonLink><ButtonLink href={GITHUB_URL || '#open-source'}><Github size={16} /> View on GitHub</ButtonLink></div></div><div className="hero-visual reveal reveal-delay"><BrowserMockup /></div></section>
}

function Problem() {
  const steps = ['Search', 'Recommendation', 'Urgency', 'Upsell', 'Impulse purchase']
  return <section className="problem section-pad" id="problem"><div className="split-heading"><div><SectionTag number="01" >THE PROBLEM</SectionTag><h2>The interface is<br /><em>part of the decision.</em></h2></div><div className="intro-copy"><p>Modern shopping interfaces do more than show products.</p><p>They shape the moment around a decision, adding just enough pressure to turn a want into a cart.</p></div></div><div className="journey">{steps.map((step, index) => <div className="journey-step" key={step}><div className={`journey-node node-${index}`}><span>{String(index + 1).padStart(2, '0')}</span></div><span>{step}</span>{index < steps.length - 1 && <ArrowRight className="journey-arrow" size={20} />}</div>)}</div></section>
}

function DecisionReplay() {
  const events = [['10:31', 'Search “USB-C cable”', 'Search'], ['10:32', 'Open $4.99 product', 'Product'], ['10:33', 'See “Only 3 left”', 'Scarcity'], ['10:33', 'Browse recommended products', 'Recommendation'], ['10:34', 'Open $12.99 product', 'Upsell'], ['10:35', 'Add to cart', 'Decision']]
  return <section className="replay section-dark section-pad" id="features"><div className="replay-heading"><div><SectionTag number="02">DECISION REPLAY</SectionTag><h2>What if you could<br /><em>replay your decision?</em></h2></div><p>A record of the moments that changed the shape of your choice. Not certainty. Context.</p></div><div className="timeline-wrap"><div className="timeline-line" />{events.map(([time, text, type], index) => <div className={`timeline-row ${index === 2 ? 'turning-point' : ''}`} key={`${time}-${text}`}><span className="timeline-time">{time}</span><span className="timeline-dot" /><div className="timeline-event"><span>{text}</span>{index === 2 && <div className="influence"><CircleAlert size={13} /><span>Decision turning point</span><b>Potential influence: HIGH</b></div>}</div><span className="timeline-type">{type}</span></div>)}</div></section>
}

function IntentDelta() {
  return <section className="intent section-pad"><div className="intent-header"><SectionTag number="03">INTENT & DECISION DELTA</SectionTag><h2>Remember what you<br /><em>actually came here to buy.</em></h2></div><div className="delta-grid"><div className="intent-card"><div className="card-title">Original intent <Eye size={16} /></div><div className="intent-list"><span><b>Budget</b><strong>$10</strong></span><span><b>Purpose</b><strong>Laptop charging</strong></span><span><b>Required</b><strong>USB-C</strong></span><span><b>Exclude</b><strong>Unnecessary accessories</strong></span></div></div><div className="delta-arrow"><ArrowRight size={24} /></div><div className="intent-card final-card"><div className="card-title">Final decision <PackageCheck size={16} /></div><div className="final-price">$24.99</div><div className="added-items"><Plus size={14} /> 3 added accessories</div><div className="delta-score"><span>Decision delta</span><strong>+67%</strong></div></div></div></section>
}

function CausalReplay() {
  const path = ['Search', 'Product', 'Persuasion element', 'Product change', 'Higher price', 'Cart']
  return <section className="causal section-pad"><div className="causal-copy"><SectionTag number="04">CAUSAL DECISION REPLAY</SectionTag><h2>See how your decision<br /><em>changed over time.</em></h2><p>Trace the path from intent to outcome, with the persuasion patterns that appeared along the way.</p><ButtonLink>Explore the replay <ArrowRight size={15} /></ButtonLink></div><div className="causal-map">{path.map((step, index) => <div className={`causal-step ${index === 2 ? 'active' : ''}`} key={step}><span className="causal-index">0{index + 1}</span><span>{step}</span>{index === 2 && <span className="influence-pill">SCARCITY</span>}{index < path.length - 1 && <div className="causal-connector" />}</div>)}</div></section>
}

function NeutralRebuild() {
  return <section className="neutral section-pad"><div className="neutral-header"><SectionTag number="05">NEUTRAL REBUILD</SectionTag><h2>Remove the pressure.<br /><em>Keep the information.</em></h2><p>Same product. Same facts. A different environment for making a choice.</p></div><div className="before-after"><div className="ba-panel"><div className="ba-label"><span>BEFORE</span><b>Persuasion-heavy</b></div><BrowserMockup compact /></div><div className="ba-divider"><ArrowRight size={18} /></div><div className="ba-panel"><div className="ba-label after-label"><span>AFTER</span><b>Decision-ready</b></div><BrowserMockup neutral compact /></div></div><div className="still-buy"><span>THE QUESTION</span><h3>Would you still <em>buy it?</em></h3><ArrowDownRight size={27} /></div></section>
}

function Fingerprint() {
  const items = [['Countdown', '82%', 'high'], ['Scarcity', '71%', 'mid'], ['Social Proof', '52%', 'low'], ['Upselling', '91%', 'high'], ['Recommendations', '61%', 'mid']]
  return <section className="fingerprint section-dark section-pad"><div className="fingerprint-copy"><SectionTag number="06">PERSONALIZED DECISION DEFENSE</SectionTag><h2>Learn what<br /><em>influences you.</em></h2><p>Over time, Dehype learns which persuasion patterns are most associated with changes in your decisions.</p><span className="soft-note">Your fingerprint is a mirror, not a verdict.</span></div><div className="fingerprint-chart"><div className="chart-heading"><span>YOUR DECISION FINGERPRINT</span><span>01 — 05</span></div>{items.map(([label, percent, tone], index) => <div className="fingerprint-row" key={label}><span className="fingerprint-number">0{index + 1}</span><span className="fingerprint-label">{label}</span><div className="meter"><i className={tone} style={{ width: percent }} /></div><strong>{percent}</strong></div>)}</div></section>
}

function Demo() {
  const [neutral, setNeutral] = useState(false)
  return <section className="demo section-pad" id="demo"><div className="demo-heading"><div><SectionTag number="07">INTERACTIVE DEMO</SectionTag><h2>See the difference<br /><em>one click makes.</em></h2></div><div className="demo-controls"><button className={!neutral ? 'selected' : ''} onClick={() => setNeutral(false)}>Original</button><button className={neutral ? 'selected' : ''} onClick={() => setNeutral(true)}>Neutral rebuild</button></div></div><div className="demo-window"><div className="demo-status"><span><span className="status-dot" /> LIVE PAGE PREVIEW</span><span>{neutral ? 'NEUTRAL MODE' : 'ORIGINAL MODE'}</span></div><div className="demo-stage"><BrowserMockup neutral={neutral} /></div><button className="rebuild-button" onClick={() => setNeutral(!neutral)}>{neutral ? 'View original' : 'Rebuild page'} <Sparkles size={15} /></button></div></section>
}

function Philosophy() { return <section className="philosophy section-pad"><span className="philosophy-index">08 / PHILOSOPHY</span><h2>We don't want to<br /><em>stop you from buying.</em></h2><h2 className="philosophy-second">We want you to know<br /><em>why you're buying.</em></h2></section> }

function HowItWorks() {
  const items = [['01', 'Define your intent', 'Start with what you came for.'], ['02', 'Browse normally', 'Shop as you always do.'], ['03', 'Detect persuasion patterns', 'See what the interface is doing.'], ['04', 'Replay your decision', 'Trace the moments that shifted.'], ['05', 'Rebuild the page', 'Remove pressure. Keep facts.'], ['06', 'Make your decision', 'The choice is still yours.']]
  return <section className="how section-pad" id="how-it-works"><div className="how-heading"><SectionTag number="09">HOW IT WORKS</SectionTag><h2>A little more<br /><em>distance.</em></h2></div><div className="how-grid">{items.map(([num, title, text]) => <div className="how-item" key={num}><span className="how-num">{num}</span><h3>{title}</h3><p>{text}</p><ArrowDownRight size={17} /></div>)}</div></section>
}

function OpenSource() { return <section className="open-source section-pad" id="open-source"><div className="opensource-mark"><Github size={31} /></div><div><SectionTag number="10">OPEN SOURCE</SectionTag><h2>Built in<br /><em>the open.</em></h2><p>Dehype is an experimental project exploring how technology can help people make more deliberate decisions online.</p><ButtonLink primary href={GITHUB_URL || '#top'}>View on GitHub <ArrowUpRightFallback /></ButtonLink></div></section> }
const ArrowUpRightFallback = () => <ArrowRight size={15} />

function Footer() { return <footer className="footer section-pad"><div className="footer-top"><a className="brand" href="#top">DEHYPE<span>.</span></a><p>Understand the decision.<br />Own the choice.</p><div className="footer-links"><a href={GITHUB_URL || '#open-source'}>GitHub</a><a href="#how-it-works">How It Works</a><a href="#features">Features</a></div></div><div className="footer-bottom"><span>© 2026 DEHYPE PROJECT</span><span>AN EXPERIMENT IN AGENCY</span></div></footer> }

export default function App() {
  return <div><Navbar /><main><Hero /><Problem /><DecisionReplay /><IntentDelta /><CausalReplay /><NeutralRebuild /><Fingerprint /><Demo /><Philosophy /><HowItWorks /><OpenSource /><section className="final-cta section-pad"><SectionTag number="11">YOUR NEXT DECISION</SectionTag><h2>Before you buy,<br /><em>dehype your decision.</em></h2><div className="final-actions"><ButtonLink primary>Try Dehype <Zap size={15} /></ButtonLink><ButtonLink href={GITHUB_URL || '#open-source'}>View Project <ArrowRight size={15} /></ButtonLink></div></section></main><Footer /></div>
}
