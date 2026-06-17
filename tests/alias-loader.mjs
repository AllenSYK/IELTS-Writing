export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = specifier.slice(2)
    const suffix = target.endsWith('.ts') || target.endsWith('.tsx') ? '' : '.ts'
    return {
      url: new URL(`../${target}${suffix}`, import.meta.url).href,
      shortCircuit: true
    }
  }
  if ((specifier.startsWith('../') || specifier.startsWith('./')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    return {
      url: new URL(`${specifier}.ts`, context.parentURL).href,
      shortCircuit: true
    }
  }
  return nextResolve(specifier, context)
}
