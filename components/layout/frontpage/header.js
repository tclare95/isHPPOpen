import Alert from 'react-bootstrap/Alert'
import Row from 'react-bootstrap/Row'

export default function Header () {
    return (
        <Row className="justify-content-center">
            <Alert variant="danger">Environment Agency Level forecast is re-enabled and direct session booking links are now working</Alert>
        </Row>
    )
}