import Alert from 'react-bootstrap/Alert'
import Row from 'react-bootstrap/Row'

export default function Header () {
    return (
        <Row className="justify-content-center">
            <Alert variant="danger">HPP will reopen 10/04/21. See events below. EA forecast data has an issue and is not lining up.</Alert>
        </Row>
    )
}