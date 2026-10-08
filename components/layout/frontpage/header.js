import Alert from 'react-bootstrap/Alert'
import PropTypes from 'prop-types'
import Row from 'react-bootstrap/Row'
import { useCallback, useSyncExternalStore } from 'react'

function toTimestamp(value) {
    if (!value) {
        return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

export default function Header ({message}) {
    const banner = typeof message === 'string'
        ? { banner_message: message, banner_enabled: Boolean(message) }
        : message;

    const bannerMessage = banner?.banner_message ?? '';
    const bannerTitle = banner?.banner_title ?? '';
    const bannerEnabled = typeof banner?.banner_enabled === 'boolean'
        ? banner.banner_enabled
        : bannerMessage.length > 0;
    const bannerStart = toTimestamp(banner?.banner_start_date)
    const bannerEnd = toTimestamp(banner?.banner_end_date)
    const inWindow = useSyncExternalStore(
        useCallback((onChange) => {
            let timer
            const refresh = () => {
                clearTimeout(timer)
                const now = Date.now()
                onChange()
                const nextBoundary = [bannerStart, bannerEnd === null ? null : bannerEnd + 1]
                    .filter((time) => time !== null && time > now)
                    .sort((a, b) => a - b)[0]
                if (nextBoundary !== undefined) {
                    timer = setTimeout(refresh, Math.min(nextBoundary - now, 2147483647))
                }
            }
            refresh()
            window.addEventListener('focus', refresh)
            return () => {
                clearTimeout(timer)
                window.removeEventListener('focus', refresh)
            }
        }, [bannerStart, bannerEnd]),
        useCallback(() => {
            const now = Date.now()
            return (bannerStart === null || bannerStart <= now) && (bannerEnd === null || bannerEnd >= now)
        }, [bannerStart, bannerEnd]),
        // Cached server HTML cannot know the viewing time; scheduled banners resolve after hydration.
        useCallback(() => bannerStart === null && bannerEnd === null, [bannerStart, bannerEnd]),
    )

    if (!bannerEnabled || bannerMessage.length === 0 || !inWindow) {
        return null;
    }

    return (
        <Row className="justify-content-center mx-5 mt-1">
            <Alert variant="danger" className="text-center">
                {bannerTitle ? <Alert.Heading className="h5 mb-2">{bannerTitle}</Alert.Heading> : null}
                <div>{bannerMessage}</div>
            </Alert>
        </Row>
    )
}

Header.propTypes = {
    message: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
            banner_title: PropTypes.string,
            banner_message: PropTypes.string,
            banner_enabled: PropTypes.bool,
            banner_start_date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
            banner_end_date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
        }),
    ]),
}
