jest.mock('../libs/services/eventsService');
jest.mock('../libs/services/siteBannerService');

const { fetchUpcomingEvents } = require('../libs/services/eventsService');
const { getBanners } = require('../libs/services/siteBannerService');
const { fetchHomePageSnapshot } = require('../libs/services/homePageService');

describe('homePageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns banner data even when events fetching fails', async () => {
    fetchUpcomingEvents.mockRejectedValue(new Error('Mongo unavailable'));
    getBanners.mockResolvedValue([
      {
        _id: { toString: () => 'banner-1' },
        banner_message: 'Banner message',
        banner_update_date: '2026-03-08T10:00:00Z',
      },
    ]);

    const result = await fetchHomePageSnapshot();

    expect(result.events).toEqual([]);
    expect(result.message.banner_message).toBe('Banner message');
  });

  test('returns events even when banner fetching fails', async () => {
    fetchUpcomingEvents.mockResolvedValue({
      eventsArray: [
        {
          _id: { toString: () => 'event-1' },
          event_name: 'Test event',
          event_start_date: '2026-03-08T10:00:00Z',
          event_end_date: '2026-03-09T10:00:00Z',
          event_details: 'Details',
        },
      ],
    });
    getBanners.mockRejectedValue(new Error('Mongo unavailable'));

    const result = await fetchHomePageSnapshot();

    expect(result.events).toHaveLength(1);
    expect(result.message.banner_message).toBe('');
  });
});