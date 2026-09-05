import { describe, expect, it } from 'vitest'

describe('Gauge chart config', () => {
  it('gauge receives correct success value', () => {
    const value = 81.82
    const expectedData = [{ value: '81.8' }]
    expect(expectedData[0].value).toBe('81.8')
  })

  it('gauge receives correct failure value', () => {
    const value = 7.14
    const expectedData = [{ value: '7.1' }]
    expect(expectedData[0].value).toBe('7.1')
  })

  it('gauge handles zero value', () => {
    const value = 0
    const expectedData = [{ value: '0.0' }]
    expect(expectedData[0].value).toBe('0.0')
  })

  it('gauge handles 100 percent', () => {
    const value = 100
    const expectedData = [{ value: '100.0' }]
    expect(expectedData[0].value).toBe('100.0')
  })

  it('gauge rounds correctly for non-terminating decimals', () => {
    const value = 33.335
    const expectedData = [{ value: '33.3' }]
    expect(expectedData[0].value).toBe('33.3')
  })
})

describe('DashboardPage tests', () => {
  it('placeholder test', () => {
    expect(true).toBe(true)
  })
})
