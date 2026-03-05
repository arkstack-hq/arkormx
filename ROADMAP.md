# Arkorm Roadmap & Implementation Status

This document tracks all implemented and upcoming features for Arkorm.

## Implemented Features

- [x] Model base class with attribute casting, mutators, and serialization
- [x] Query builder with fluent API
- [x] Eloquent-style relationships (hasOne, hasMany, belongsTo, belongsToMany, hasOneThrough, hasManyThrough, morphOne, morphMany, morphToMany)
- [x] Eager loading with constraints
- [x] Pagination support
- [x] Collection integration (collect.js)
- [x] Attribute visibility (hidden/visible/appends)
- [x] Local scopes
- [x] Soft deletes (withTrashed, onlyTrashed, restore, forceDelete)
- [x] Prisma delegate adapter/helper
- [x] Database adapter layer (Model.setAdapter + PrismaAdapter)
- [x] Prisma schema + migration workflow
- [x] PostgreSQL integration test suite (real DB)
- [x] CI PostgreSQL service integration tests
- [x] Publish pipeline PostgreSQL integration gate
- [x] Comprehensive test suite
- [x] TypeScript strict mode compatibility

## Upcoming / Planned Features

- [ ] Global scopes
- [ ] Transaction support
- [ ] Event hooks (creating, updating, deleting, etc.)
- [ ] Validation integration
- [ ] CLI tooling for model/resource generation
- [ ] Improved error handling and messages
- [ ] Documentation site
- [ ] More advanced relationship constraints
- [ ] Performance optimizations
- [ ] Additional database adapters (non-Prisma drivers)

## Status Legend

- [x] Implemented
- [ ] Planned / Not yet implemented

---

_This document will be updated as features are implemented._
