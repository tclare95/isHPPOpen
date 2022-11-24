import Link from 'next/link'
import Alert from 'react-bootstrap/Alert'
import Row from 'react-bootstrap/Row'

export default function Header ({message}) {
    return (
        
        
        <Row className="justify-content-center mx-5 mt-1">
            <Alert variant="danger text-center">{message}</Alert>
        </Row>
    )
}