import payproofLogo from './assets/payproof-logo.png'
import './App.css'

const signupUrl = 'https://app.payproof.site'

const Check = () => <span className="check" aria-hidden="true">✓</span>

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="PayProof home">
      <img className="brand-mark" src={payproofLogo} alt="" />
      <span>PayProof</span>
    </a>
  )
}

function SignupLink({ children = 'Sign up — it’s free', className = '' }) {
  return (
    <a className={`button button-primary ${className}`} href={signupUrl}>
      <span aria-hidden="true">↗</span>
      {children}
    </a>
  )
}

function ProofCard() {
  return (
    <div className="proof-card">
      <div className="proof-card-top">
        <span className="eyebrow">A BETTER WAY TO WORK</span>
        <span className="verified" aria-label="Verified">✓</span>
      </div>
      <div className="project-preview">
        <div className="project-heading">
          <span className="project-avatar">N</span>
          <div>
            <strong>Northstar website</strong>
            <small>Alex Morgan · May 12</small>
          </div>
          <span className="status-pill">Protected</span>
        </div>
        <div className="funded-label">Protected in escrow</div>
        <div className="amount">1,200 <small>NEAR</small></div>
        <div className="project-client">Funded by client</div>
        <ul className="proof-checks">
          <li><Check /> Scope agreed by both parties</li>
          <li><Check /> Funds secured before work begins</li>
          <li><Check /> Release after sign-off</li>
        </ul>
        <div className="project-footer">Recorded on NEAR Protocol <span>View proof ↗</span></div>
      </div>
    </div>
  )
}

const questions = [
  {
    question: 'Do I need a wallet to sign up?',
    answer: 'No. Start with an email or Google account. Connect a NEAR wallet when you’re ready to fund escrow or receive a payment.',
  },
  {
    question: 'Who funds the escrow?',
    answer: 'The client does. The freelancer can see when funds are secured and track release status, but never needs to deposit project funds.',
  },
  {
    question: 'When is payment released?',
    answer: 'After the freelancer submits the work and the client approves it. If either party raises a dispute, the disputed funds remain held during resolution.',
  },
  {
    question: 'What if the project is canceled?',
    answer: 'Start with the cancellation terms in your approved agreement. Review a settlement breakdown together, then move only the agreed amount through escrow.',
  },
  {
    question: 'Does AI decide a dispute?',
    answer: 'No. AI can suggest a non-binding recommendation based on the agreement and evidence. Both parties can accept a settlement or escalate for human review.',
  },
]

function App() {
  return (
    <div id="top">
      <header className="site-header">
        <div className="container nav-container">
          <Logo />
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#why-payproof">Why PayProof</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQs</a>
          </nav>
          <div className="nav-actions">
            <a className="login-link" href={signupUrl}>Log in</a>
            <SignupLink className="nav-signup">Sign up</SignupLink>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="container">
            <div className="hero-grid">
              <div className="hero-copy">
                <p className="eyebrow">INDEPENDENT WORK, PROTECTED ON NEAR</p>
                <h1>Great work.<br />Clear terms.<br />Payment assured.</h1>
                <p className="hero-description">
                  From the first brief to the final payment, PayProof keeps freelancers and clients on the same page — with clear agreements and secure NEAR escrow.
                </p>
                <div className="button-row">
                  <SignupLink />
                </div>
                <p className="microcopy">No awkward “are we still on?” texts. Just a clear workflow.<br />Your wallet, your work, your proof of trust.</p>
              </div>
              <ProofCard />
            </div>
            <div className="trust-strip" aria-label="PayProof benefits">
              <span><Check /> On-chain escrow</span>
              <span><Check /> Mutual agreements</span>
              <span><Check /> Fair resolution</span>
              <span><Check /> Built on NEAR</span>
            </div>
          </div>
        </section>

        <section className="section section-muted" id="why-payproof">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">ONE WORKSPACE. BOTH SIDES PROTECTED.</p>
              <h2>Trust shouldn’t be the risky part.</h2>
              <p>Less chasing, fewer assumptions. A shared source of truth for what gets built, what gets paid, and what happens if plans change.</p>
            </div>
            <div className="two-cards">
              <article className="benefit-card">
                <div className="card-title"><span className="line-icon">✳</span><h3>For freelancers</h3></div>
                <p>Start with confidence. See the full brief, agree on the work, and know the funds are there before you begin.</p>
                <ul className="check-list">
                  <li><Check /> No work before funded escrow</li>
                  <li><Check /> Evidence-backed delivery</li>
                  <li><Check /> A clear path to getting paid</li>
                </ul>
              </article>
              <article className="benefit-card">
                <div className="card-title"><span className="line-icon">▱</span><h3>For clients</h3></div>
                <p>Turn a great hire into a great outcome. Set expectations early and keep payment tied to the work you approve.</p>
                <ul className="check-list">
                  <li><Check /> A documented scope and timeline</li>
                  <li><Check /> Funds held until approval</li>
                  <li><Check /> Agreed cancellation terms</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">HOW IT WORKS</p>
              <h2>From a handshake to a payment.<br />Without the crossed fingers.</h2>
            </div>
            <div className="steps-grid">
              <article className="step-card">
                <span className="step-number">01</span><h3>Make it clear</h3>
                <p>Share a project brief. Invite your collaborator. Review the requirements before accepting.</p>
              </article>
              <article className="step-card">
                <span className="step-number">02</span><h3>Agree, then secure</h3>
                <p>Approve the scope together. The client funds escrow, and both sides get confirmation.</p>
              </article>
              <article className="step-card">
                <span className="step-number">03</span><h3>Deliver with proof</h3>
                <p>Submit deliverables and evidence in one workspace. The client reviews against the agreed scope.</p>
              </article>
              <article className="step-card">
                <span className="step-number">04</span><h3>Approve. Get paid.</h3>
                <p>After client approval, payment is released to the freelancer’s connected NEAR wallet.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section-muted">
          <div className="container feature-grid agreement-grid">
            <div>
              <p className="eyebrow">CLARITY BEFORE COMMITMENT</p>
              <h2>A better agreement starts with your brief.</h2>
              <p className="feature-copy">Upload your own contract or generate a draft with AI. Compare it with the project brief and catch the gaps before they become disagreements.</p>
              <ul className="check-list">
                <li><Check /> Spot missing deliverables and vague terms</li>
                <li><Check /> Review suggested changes together</li>
                <li><Check /> Only proceed when both parties approve</li>
              </ul>
              <p className="fine-print">AI assists your review. It does not provide legal advice or approve agreements for you.</p>
            </div>
            <div className="agreement-card">
              <div className="agreement-top"><strong>▣ &nbsp; PRD ↔ Agreement</strong><span>● Reviewed</span></div>
              <p className="eyebrow">SCOPE ALIGNMENT</p>
              <h3>The details make the difference.</h3>
              <div className="note note-amber"><strong>MISSING FROM CONTRACT</strong><p>The PRD specifies responsive designs. Add desktop and mobile deliverables to §2.</p></div>
              <div className="note note-green"><strong>ADDED TO FINAL AGREEMENT</strong><p>“Five key screens, all desktop and mobile breakpoints, delivered in Figma.”</p></div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container feature-grid funds-grid">
            <div className="funds-card">
              <p className="eyebrow">PAYMENT, WITH A PLAN</p>
              <div className="fund-row"><span className="round-icon">▣</span><div><strong>Client funds escrow</strong><small>1,200 NEAR secured before work starts</small></div></div>
              <div className="fund-row"><span className="round-icon">♧</span><div><strong>Funds stay protected</strong><small>Held while work is delivered and reviewed</small></div></div>
              <div className="fund-row"><span className="round-icon">✓</span><div><strong>Client approves delivery</strong><small>Payment released to the freelancer</small></div></div>
              <div className="funds-footnote">Freelancers never need to fund a project escrow that holds the client’s payment.</div>
            </div>
            <div>
              <p className="eyebrow">PAYMENT PROTECTION</p>
              <h2>Money in place.<br />Room to do your best work.</h2>
              <p className="feature-copy">No “I’ll pay you next week.” No paying blindly. Escrow gives both sides a clear, verifiable payment trail.</p>
              <ul className="check-list">
                <li><Check /> See funding and release status in real time</li>
                <li><Check /> Find every transaction on NEAR Explorer</li>
                <li><Check /> Handle changes with agreed settlement terms</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section section-muted">
          <div className="container feature-grid near-grid">
            <div>
              <p className="eyebrow">POWERED BY NEAR PROTOCOL</p>
              <h2>Web3 underneath.<br />Simply better work on top.</h2>
              <p className="feature-copy">Connect a NEAR wallet, fund an agreement, and follow every transaction. Human-readable accounts and low network fees make on-chain protection straightforward.</p>
            </div>
            <div className="near-card">
              <div className="near-card-heading"><span>NEAR ↗</span><span className="chain-status">● Connected</span></div>
              <div className="detail-row"><span>Payments</span><strong>1,200 NEAR</strong></div>
              <div className="detail-row"><span>Escrow records</span><strong>On-chain & verifiable</strong></div>
              <div className="detail-row"><span>Wallet ownership</span><strong>Always yours</strong></div>
              <p>Your funds are always yours from PayProof’s platform fees. NEAR’s native wallet gives you complete control.</p>
            </div>
          </div>
        </section>

        <section className="section quote-section">
          <div className="container quote-grid">
            <div className="workspace-art" aria-hidden="true">
              <div className="art-window"><span></span><span></span><span></span></div>
              <div className="art-shelf"></div>
              <div className="art-plant"><i></i><i></i><i></i></div>
              <div className="art-desk"></div>
              <div className="art-laptop"></div>
              <div className="art-person"><span></span><i></i></div>
            </div>
            <div className="quote-copy">
              <p className="eyebrow">BUILT FOR INDEPENDENT WORK</p>
              <blockquote>“The best projects start when everyone knows what ‘done’ looks like.”</blockquote>
              <p>From Maya and Alex, that means a shared brief, first-ever agreed page templates, and 1,200 NEAR protected before the first design. Every decision has a place. Every payment has a record.</p>
              <div className="quote-author"><span className="author-avatar">MC</span><span><strong>Maya Chen &amp; Northstar Studio</strong><small>At work together on a creator website</small></span></div>
            </div>
          </div>
        </section>

        <section className="section section-muted" id="pricing">
          <div className="container feature-grid pricing-grid">
            <div>
              <p className="eyebrow">SIMPLE, TRANSPARENT PRICING</p>
              <h2>A small fee.<br />A lot less uncertainty.</h2>
              <p className="feature-copy">Free to join, create projects, and review agreements. The client pays a 3.5% platform fee when funding escrow. No monthly plan or freelancer payout fee.</p>
              <ul className="check-list">
                <li><Check /> Agreement tools included</li>
                <li><Check /> No subscription. No hidden fees.</li>
              </ul>
            </div>
            <div className="pricing-card">
              <p className="eyebrow">ONLY WHEN ESCROW IS FUNDED</p>
              <div className="fee-rate">3.5%</div>
              <p>Paid by the client. Not deducted from your work.</p>
              <div className="price-breakdown">
                <div><span>Project amount</span><strong>1,200 NEAR</strong></div>
                <div><span>PayProof fee · 3.5%</span><strong>42 NEAR</strong></div>
                <div className="total-row"><span>Client pays</span><strong>1,242 NEAR</strong></div>
              </div>
              <small>Plus the NEAR network fee, shown to you before you confirm. The freelancer fee is the full value of the work.</small>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="container faq-grid">
            <div className="section-heading">
              <p className="eyebrow">GOOD QUESTIONS</p>
              <h2>A little more<br />peace of mind.</h2>
              <p>Understand the details before you start your next project.</p>
              <a className="text-link" href="mailto:hello@payproof.site">Talk to our team ↗</a>
            </div>
            <div className="faq-list">
              {questions.map(({ question, answer }) => (
                <details className="faq-item" key={question}>
                  <summary>{question}<span aria-hidden="true">+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="closing-cta">
          <div className="container">
            <p className="eyebrow">YOUR NEXT PROJECT, PROTECTED</p>
            <h2>Do the work you love.<br />Leave the uncertainty behind.</h2>
            <p>Make your first agreement. Build something great, together.</p>
            <div className="button-row"><SignupLink /></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <Logo />
            <nav aria-label="Footer navigation">
              <a href="#how-it-works">About</a>
              <a href="mailto:hello@payproof.site">Help center</a>
              <a href="#faq">Terms</a>
              <a href="#faq">Privacy</a>
              <a href="#top">NEAR ↗</a>
            </nav>
          </div>
          <p>Independent work deserves a stronger foundation.</p>
          <div className="copyright">© 2025 PayProof. All rights reserved. PayProof is an independent platform and is not affiliated with NEAR Protocol.</div>
        </div>
      </footer>
    </div>
  )
}

export default App
