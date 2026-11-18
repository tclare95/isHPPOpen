"use client";

import PropTypes from "prop-types";
import { signIn, signOut } from "next-auth/react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";

const NOTICES = {
  "signed-out": {
    title: "Admin sign-in required",
    text: "Sign in to manage events and update the site banner.",
  },
  denied: {
    title: "Not authorised",
    text: "You are signed in, but this account does not have admin access. If you should have access, ask the site owner to add your account ID to the admin list.",
  },
};

/** Shown in place of admin UI to signed-out visitors and to signed-in users who are not admins. */
export default function AdminAccessNotice({ state, subject = null }) {
  const notice = NOTICES[state] || NOTICES.denied;
  const signedOut = state === "signed-out";

  return (
    <Card bg="dark" text="light" border="secondary" className="text-center py-5 shadow-sm" role="alert">
      <Card.Body>
        <Card.Title as="h1" className="h4 mb-3">{notice.title}</Card.Title>
        <Card.Text className="text-secondary mb-4">{notice.text}</Card.Text>
        {!signedOut && subject ? (
          <Card.Text className="small text-secondary mb-4">
            Your account ID: <code className="text-light">{subject}</code>
          </Card.Text>
        ) : null}
        {signedOut
          ? <Button onClick={() => signIn()}>Sign in</Button>
          : <Button variant="outline-light" onClick={() => signOut()}>Sign out</Button>}
      </Card.Body>
    </Card>
  );
}

AdminAccessNotice.propTypes = {
  state: PropTypes.oneOf(["signed-out", "denied"]).isRequired,
  subject: PropTypes.string,
};
