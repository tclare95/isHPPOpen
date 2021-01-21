import { signIn, signOut, useSession } from 'next-auth/client'
import Spinner from 'react-bootstrap/Spinner'
import Row from 'react-bootstrap/Row'
import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'

export default function AdminBody (props) {
    const [session, loading] = useSession()

    if (loading) {
        return (
            <Spinner animation="border" role="status">
                <span className="sr-only">Loading...</span>
            </Spinner>
        )
    }

    if (!session) {
        return (
            <Container>
            <Row className="text-light justify-content-center">
                <h1>Please Log In</h1>            
            </Row>
            <Row className="text-light justify-content-center">
            <Button onClick={signIn}>Sign In</Button>
            </Row>
            </Container>    
        )
    }

    if(session) {
        return (
            <Container fluid="sm">
                {props.children}
            </Container>
        )
    }
    return(
        <div className="text-light">
            Admin Body - unknown issue
        </div>
    )
}