/** @jest-environment node */
// Exercise Next's actual cache boundary and request-completion invalidation, not a mocked cache.
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
jest.mock('../libs/services/eventsService', () => ({ fetchUpcomingEvents: jest.fn(), createEvent: jest.fn(), updateEventById: jest.fn(), deleteEventById: jest.fn() }));
jest.mock('../libs/services/siteBannerService', () => ({ getBanners: jest.fn(), upsertBanner: jest.fn() }));
jest.mock('../components/pages/HomePageClient', () => function MockHomePage() { return null; });

const { randomUUID } = require('node:crypto');
const nodeFs = require('node:fs/promises');
const { IncrementalCache } = require('next/dist/server/lib/incremental-cache');
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external');
const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external');
const { executeRevalidates } = require('next/dist/server/revalidation-utils');
const { getServerSession } = require('next-auth');
const eventsService = require('../libs/services/eventsService');
const bannerService = require('../libs/services/siteBannerService');
const { default: HomePage } = require('../app/page');
const eventsRoute = require('../app/api/admin/events/route');
const eventRoute = require('../app/api/admin/events/[id]/route');
const bannerRoute = require('../app/api/sitebanner/route');

describe('Editorial writes across the real Next.js cache boundary', () => {
  let cache;
  let events;
  let banner;
  let clock = Date.now(); // Align with Next's performance.timeOrigin-based cache age.

  beforeEach(() => {
    jest.clearAllMocks();
    clock += 1000; // Keep timestamps newer than tags left by earlier test cases.
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    cache = new IncrementalCache({ fs: nodeFs, dev: false, flushToDisk: false,
      serverDistDir: `${process.cwd()}/.next/editorial-cache-test/server`, requestHeaders: {},
      maxMemoryCacheSize: 1024 * 1024, fetchCacheKeyPrefix: randomUUID(),
      getPrerenderManifest: () => ({ version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: 'test' } }),
    });
    events = [{ _id: 'event-1', event_name: 'Original event' }];
    banner = { banner_message: 'Original notice', banner_enabled: true };
    getServerSession.mockResolvedValue({ user: { id: 'auth0|test-admin', email: 'admin@test.com' } });
    eventsService.fetchUpcomingEvents.mockImplementation(async () => ({ eventsArray: events }));
    bannerService.getBanners.mockImplementation(async () => [banner]);
    eventsService.createEvent.mockImplementation(async ({ name }) => {
      events = [...events, { _id: 'event-2', event_name: name }];
      return { id: 'event-2', name };
    });
    eventsService.updateEventById.mockImplementation(async (id, { name }) => {
      events = [{ _id: id, event_name: name }];
      return { event: { id, name }, changed: true };
    });
    eventsService.deleteEventById.mockImplementation(async (id) => { events = []; return { id }; });
    bannerService.upsertBanner.mockImplementation(async (payload) => { banner = payload; return { modifiedCount: 1 }; });
  });

  afterEach(() => jest.restoreAllMocks());

  async function request(callback) {
    const store = { incrementalCache: cache, isStaticGeneration: false, page: '/route' };
    return workAsyncStorage.run(store, () => workUnitAsyncStorage.run({ type: 'request', phase: 'action', url: { pathname: '/', search: '' } }, async () => {
      const result = await callback();
      await executeRevalidates(store);
      return result;
    }));
  }
  const body = (payload) => ({ async json() { return payload; } });

  test.each(['event creation', 'event update', 'event deletion', 'banner update'])('%s is visible on the first subsequent homepage read', async (operation) => {
    const original = await request(HomePage);
    expect(console.error).not.toHaveBeenCalled();
    // A second request must hit the cache even after backing content changes.
    events = [{ _id: 'event-1', event_name: 'Changed outside the write route' }];
    banner = { banner_message: 'Changed outside the write route', banner_enabled: true };
    expect((await request(HomePage)).props).toEqual(original.props);
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledTimes(1);
    expect(bannerService.getBanners).toHaveBeenCalledTimes(1);

    clock += 1; // Next expires entries only when the tag timestamp is strictly newer.
    const context = { params: Promise.resolve({ id: 'event-1' }) };
    const response = await request(() => operation === 'event creation'
      ? eventsRoute.POST(body({ name: 'New event' }))
      : operation === 'event update'
        ? eventRoute.PUT(body({ name: 'Saved event' }), context)
        : operation === 'event deletion'
          ? eventRoute.DELETE({ nextUrl: new URL('http://localhost/api/admin/events/event-1') }, context)
          : bannerRoute.POST(body({ banner_message: 'Saved notice', banner_enabled: true })));
    expect(response.status).toBe(operation === 'event creation' ? 201 : 200);
    const fresh = (await request(HomePage)).props;
    if (operation === 'event creation') expect(fresh.events.map((item) => item.event_name)).toEqual(['Changed outside the write route', 'New event']);
    if (operation === 'event update') expect(fresh.events[0].event_name).toBe('Saved event');
    if (operation === 'event deletion') expect(fresh.events).toEqual([]);
    if (operation === 'banner update') expect(fresh.message.banner_message).toBe('Saved notice');
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledTimes(2);
    expect(bannerService.getBanners).toHaveBeenCalledTimes(2);
    expect((await request(HomePage)).props).toEqual(fresh);
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled(); // No deprecated signature or swallowed invalidation failures.
    expect(console.error).not.toHaveBeenCalled();
  });

  test('unauthenticated writes leave the warmed homepage cache untouched', async () => {
    const original = (await request(HomePage)).props;
    getServerSession.mockResolvedValue(null);
    expect((await request(() => eventsRoute.POST(body({ name: 'Unauthorized' })))).status).toBe(401);
    expect((await request(() => bannerRoute.POST(body({ banner_message: 'Unauthorized' })))).status).toBe(401);
    expect(eventsService.createEvent).not.toHaveBeenCalled();
    expect(bannerService.upsertBanner).not.toHaveBeenCalled();
    expect((await request(HomePage)).props).toEqual(original);
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledTimes(1);
    expect(bannerService.getBanners).toHaveBeenCalledTimes(1);
  });
});
