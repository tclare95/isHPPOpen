import Toast from 'react-bootstrap/Toast'

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