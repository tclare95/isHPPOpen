import { signIn, signOut, useSession } from 'next-auth/client'
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav'
import Link from 'next/link'
import Button from 'react-bootstrap/Button';


export default function AdminBar () {
    const [session, loading] = useSession()

        if(session) {
            return (
                <Navbar bg="dark" expand="lg" className="text-light">
                    <Link href="/admin" passHref><Navbar.Brand className="text-light">Is HPP Open Admin</Navbar.Brand></Link>
                    <Nav className="mr-auto">
                    <Link href="/admin/events" passHref><Nav.Link className="text-light">Edit Events</Nav.Link></Link>
                    <Link href="/admin/message" passHref><Nav.Link className="text-light">Edit Site Message</Nav.Link></Link>
                    </Nav>
                    <Navbar.Toggle />
                    <Navbar.Collapse className="justify-content-end">
                        <Navbar.Text className="mr-2 text-light">
                            Signed in As {session.user.name}
                        </Navbar.Text>
                        
                        <Button onClick={signOut}>Sign Out</Button>
                    </Navbar.Collapse>
                    
                </Navbar>
            )
        }

        return (
            <Navbar bg="dark" expand="lg" className="text-light">
                    <Link href="/admin" passHref><Navbar.Brand className="text-light">Is HPP Open Admin</Navbar.Brand></Link>
                    <Navbar.Toggle />
                    <Navbar.Collapse className="justify-content-end">
                        <Navbar.Text className="mr-2 text-light">
                            You are not signed in
                        </Navbar.Text>
                        
                        <Button onClick={signIn}>Sign In</Button>
                    </Navbar.Collapse>
                    
                </Navbar>
        )
        
    
}

/*
<Navbar bg="dark" expand="lg">
                <Link href="/admin"><Navbar.Brand>Is HPP Open Admin</Navbar.Brand></Link>
                <Nav className="mr-auto">
                <Link href="/admin/events"><Nav.Link>Edit Events</Nav.Link></Link>
                <Link href="/admin/message"><Nav.Link>Edit Site Message</Nav.Link></Link>
                </Nav>
                <Navbar.Toggle />
                <Navbar.Collapse className="justify-content-end">
                    <Navbar.text>
                        Signed in As 
                    </Navbar.text>
                    <Button onClick={signOut}>Sign Out</Button>
                </Navbar.Collapse>
            </Navbar> */