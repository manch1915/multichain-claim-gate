export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Testnets only: Sepolia, Base Sepolia and Solana devnet. MRD and the pass have no market
          value.
        </p>
        <p className="flex gap-4">
          <a className="hover:text-ink" href="https://github.com/manch1915/multichain-claim-gate">
            Source on GitHub
          </a>
          <a className="hover:text-ink" href="https://narcisbin.com">
            Built by Levon Oganesian
          </a>
        </p>
      </div>
    </footer>
  )
}
