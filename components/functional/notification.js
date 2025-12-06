import Toast from 'react-bootstrap/Toast'
import PropTypes from 'prop-types'

export default function NotificationToast (props) {
    return (
        <Toast show={props.show}>
            <Toast.Header>
                <strong className="mr-auto">{props.title}</strong>
            </Toast.Header>
            <Toast.Body>{props.message}</Toast.Body>
        </Toast>
    )
}

NotificationToast.propTypes = {
  show: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
};