import { describe, expect, it } from 'vitest'
import { likeTerm, parsePaging, seqFromSearch } from './paging.js'

const SORTS = ['updated', 'customer'] as const
const fallback = { sort: 'updated' as const, dir: 'desc' as const }

describe('paging', () => {
  it('reads and clamps page, size, sort and direction', () => {
    expect(parsePaging({ page: '3', pageSize: '10', sort: 'customer', dir: 'asc', q: '  acme ' }, SORTS, fallback)).toEqual({
      page: 3, pageSize: 10, offset: 20, sort: 'customer', dir: 'asc', q: 'acme',
    })
    expect(parsePaging({ page: '-4', pageSize: '5000', sort: 'drop table', dir: 'sideways' }, SORTS, fallback)).toEqual({
      page: 1, pageSize: 100, offset: 0, sort: 'updated', dir: 'desc', q: '',
    })
    expect(parsePaging({}, SORTS, fallback).pageSize).toBe(25)
  })

  it('finds the sequence number in a quote or invoice number', () => {
    expect(seqFromSearch('QT-2026-0042')).toBe(42)
    expect(seqFromSearch('INV-2026-7')).toBe(7)
    expect(seqFromSearch('42')).toBe(42)
    expect(seqFromSearch('Acme')).toBeNull()
  })

  it('escapes LIKE wildcards in search text', () => {
    expect(likeTerm('50%_off')).toBe('%50\\%\\_off%')
  })
})
