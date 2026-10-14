const h = require('./harness.cjs')
// A minimal effect-capable React host. Only React/Next/browser boundaries are
// replaced: the real AuthProvider, CartProvider, reducer and pages execute.
function browser(account) {
  const instances = new Map()
  let current, cursor, dirty = true
  let effects = []
  const events = []
  function slot(init) {
    const index = cursor++
    if (!(index in current)) current[index] = init()
    return current[index]
  }
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }),
    createContext(value) { const context = { value }; context.Provider = { context }; return context },
    useContext: context => context.value,
    useState(initial) {
      const cell = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      cell.set ||= value => { const next = typeof value === 'function' ? value(cell.value) : value; if (!Object.is(next, cell.value)) { cell.value = next; dirty = true } }
      return [cell.value, cell.set]
    },
    useReducer(reducer, initial) {
      const cell = slot(() => ({ value: initial }))
      cell.dispatch ||= action => { cell.value = reducer(cell.value, action); dirty = true }
      return [cell.value, cell.dispatch]
    },
    useRef: value => slot(() => ({ current: value })),
    useMemo(fn, deps) { const cell = slot(() => ({})); if (!same(cell.deps, deps)) { cell.value = fn(); cell.deps = deps } return cell.value },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const cell = slot(() => ({})); if (!same(cell.deps, deps)) { cell.deps = deps; effects.push(fn) } },
  }
  react.useLayoutEffect = react.useEffect
  h.stubs.react = react
  h.stubs['next/link'] = 'a'
  h.stubs['next/image'] = 'img'
  h.stubs['next/navigation'] = { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/' }
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  global.fetch = async (url, options = {}) => {
    events.push({ url: String(url), ...options })
    return { ok: true, status: 200, json: async () => String(url).endsWith('/api/users/me') ? { user: account } : { docs: [], errors: [] } }
  }
  function render(node, key = 'root') {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach((child, i) => render(child, `${key}.${i}`)); return }
    const { type, props } = node
    if (type?.context) {
      const old = type.context.value
      type.context.value = props.value
      render(props.children, `${key}.provider`)
      type.context.value = old
    } else if (typeof type === 'function') {
      if (!instances.has(key)) instances.set(key, [])
      current = instances.get(key); cursor = 0
      render(type(props), `${key}.child`)
    } else render(props?.children, `${key}.children`)
  }
  async function settle(tree) {
    dirty = true
    for (let i = 0; i < 20 && dirty; i++) {
      dirty = false; effects = []
      render(tree)
      for (const effect of effects) effect()
      for (let tick = 0; tick < 8; tick++) await Promise.resolve()
    }
    if (dirty) throw new Error('React fixture failed to settle')
  }
  return { react, events, settle }
}
module.exports = { browser }
