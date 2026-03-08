import Alert from 'react-bootstrap/Alert'
import PropTypes from 'prop-types'
import Row from 'react-bootstrap/Row'

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
    const now = Date.now()
    const hasStarted = bannerStart === null || bannerStart <= now
    const hasNotEnded = bannerEnd === null || bannerEnd >= now

    if (!bannerEnabled || bannerMessage.length === 0 || !hasStarted || !hasNotEnded) {
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