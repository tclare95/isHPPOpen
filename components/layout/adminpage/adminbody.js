import { signIn, useSession } from 'next-auth/react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Container from 'react-bootstrap/Container'
import Spinner from 'react-bootstrap/Spinner'

export default function AdminBody (props) {
    const { data: session, status } = useSession()

    if (status === 'loading') {
        return (
            <Container fluid="lg" className="pb-5">
                <Card bg="dark" text="light" border="secondary" className="text-center py-5">
                    <Card.Body>
                        <Spinner animation="border" role="status" className="mb-3" />
                        <div>Checking your session…</div>
                    </Card.Body>
                </Card>
            </Container>
        )
    }

    if (!session) {
        return (
            <Container fluid="lg" className="pb-5">
                <Card bg="dark" text="light" border="secondary" className="text-center py-5 shadow-sm">
                    <Card.Body>
                        <Card.Title className="mb-3">Admin sign-in required</Card.Title>
                        <Card.Text className="text-secondary mb-4">
                            Sign in to manage events and update the site banner.
                        </Card.Text>
                        <Button onClick={signIn}>Sign in</Button>
                    </Card.Body>
                </Card>
            </Container>
        )
    }

    if (session) {
        return (
            <Container fluid="lg" className="pb-5">
                {props.children}
            </Container>
        )
    }

    return (
        <Alert variant="danger">Unable to load the admin area.</Alert>
    )
}