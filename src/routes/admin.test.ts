import { describe, expect, test } from 'bun:test'
import { Route } from './admin'

function runBeforeLoad(pathname: string) {
  return () => Route.options.beforeLoad?.({ location: { pathname } } as never)
}

describe('admin route redirect', () => {
  test('redirects exact /admin to monitor management', () => {
    expect(runBeforeLoad('/admin')).toThrow()
  })

  test('does not redirect admin child routes', () => {
    expect(runBeforeLoad('/admin/monitors')).not.toThrow()
  })
})
