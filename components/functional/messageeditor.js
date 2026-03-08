import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import useSWR, { mutate } from "swr";
import * as Yup from "yup";
import { fetcher } from "../../libs/fetcher";

function optionalDateSchema() {
    return Yup.date().transform((value, originalValue) => {
        if (originalValue === "" || originalValue === null || originalValue === undefined) {
            return null;
        }

        return value;
    }).nullable();
}

const validationSchema = Yup.object({
    banner_title: Yup.string().max(120, "Title must be 120 characters or fewer"),
    banner_message: Yup.string().when("banner_enabled", {
        is: true,
        then: (schema) => schema.trim().required("Banner message is required when the banner is enabled"),
        otherwise: (schema) => schema,
    }),
    banner_enabled: Yup.boolean().required(),
    banner_start_date: optionalDateSchema(),
    banner_end_date: optionalDateSchema().test(
        "banner-end-date-after-start",
        "End date must be after the start date",
        function validateEndDate(value) {
            if (value === null) {
                return true;
            }

            if (this.parent.banner_start_date === null) {
                return true;
            }

            return value >= this.parent.banner_start_date;
        },
    ),
});

function formatDateTimeInput(value) {
    if (!value) {
        return "";
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    const offset = parsed.getTimezoneOffset();
    const localDate = new Date(parsed.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().slice(0, 16);
}

function getDefaultBanner() {
    return {
        banner_title: "",
        banner_message: "",
        banner_enabled: false,
        banner_start_date: "",
        banner_end_date: "",
        banner_update_date: "",
    };
}

function buildSuggestedEndDate(startValue) {
    const baseDate = startValue ? new Date(startValue) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
        return "";
    }

    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 7);
    return formatDateTimeInput(nextDate);
}

function toTimestamp(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatScheduleDate(value, fallback = "No date set") {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString();
}

function normalizeBanner(messageData) {
    const existingBanner = Array.isArray(messageData) && messageData.length > 0 ? messageData[0] : null;
    const defaults = getDefaultBanner();

    return {
        banner_title: existingBanner?.banner_title ?? defaults.banner_title,
        banner_message: existingBanner?.banner_message ?? defaults.banner_message,
        banner_enabled: typeof existingBanner?.banner_enabled === "boolean"
            ? existingBanner.banner_enabled
            : Boolean(existingBanner?.banner_message),
        banner_start_date: formatDateTimeInput(existingBanner?.banner_start_date) || defaults.banner_start_date,
        banner_end_date: formatDateTimeInput(existingBanner?.banner_end_date) || defaults.banner_end_date,
        banner_update_date: existingBanner?.banner_update_date ?? defaults.banner_update_date,
    };
}

function getBannerStatus(values) {
    if (!values.banner_enabled) {
        return { label: "Hidden", variant: "secondary", description: "The banner is saved but not shown on the homepage." };
    }

    const now = Date.now();
    const startTime = toTimestamp(values.banner_start_date);
    const endTime = toTimestamp(values.banner_end_date);

    if (startTime !== null && startTime > now) {
        return {
            label: "Scheduled",
            variant: "warning",
            description: endTime === null
                ? "The banner will go live at the scheduled start time and stay visible until you hide it."
                : "The banner is enabled and will go live at the scheduled start time.",
        };
    }

    if (endTime !== null && endTime < now) {
        return { label: "Expired", variant: "dark", description: "The end time has passed, so the banner schedule is no longer current." };
    }

    return {
        label: "Live",
        variant: "success",
        description: startTime === null && endTime === null
            ? "The banner is visible immediately and will stay live until you hide it."
            : endTime === null
                ? "The banner is currently visible on the homepage and will stay live until you hide it."
                : "The banner is currently visible on the homepage.",
    };
}

function normalizeValidationError(error) {
    if (!error?.inner) {
        return {};
    }

    return error.inner.reduce((accumulator, currentError) => {
        if (currentError.path && !accumulator[currentError.path]) {
            accumulator[currentError.path] = currentError.message;
        }

        return accumulator;
    }, {});
}

export default function MessageEditor() {
    const { data: messageData, error: messageError, isLoading } = useSWR("/api/sitebanner", fetcher);
    const initialValues = useMemo(() => normalizeBanner(messageData), [messageData]);
    const [values, setValues] = useState(initialValues);
    const [touched, setTouched] = useState({});
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setValues(initialValues);
        setTouched({});
        setErrors({});
        setStatus(null);
    }, [initialValues]);

    async function validateForm(nextValues = values) {
        try {
            await validationSchema.validate(nextValues, { abortEarly: false });
            setErrors({});
            return {};
        } catch (error) {
            const nextErrors = normalizeValidationError(error);
            setErrors(nextErrors);
            return nextErrors;
        }
    }

    function updateValue(field, nextValue) {
        setValues((currentValues) => ({
            ...currentValues,
            [field]: nextValue,
        }));
        setStatus(null);
    }

    async function handleBlur(field) {
        setTouched((currentTouched) => ({
            ...currentTouched,
            [field]: true,
        }));
        await validateForm();
    }

    function resetForm() {
        setValues(initialValues);
        setTouched({});
        setErrors({});
        setStatus(null);
    }

    function handleOpenEndedToggle(isOpenEnded) {
        updateValue("banner_end_date", isOpenEnded ? "" : buildSuggestedEndDate(values.banner_start_date));
    }

    function handleStartImmediatelyToggle(startImmediately) {
        setValues((currentValues) => ({
            ...currentValues,
            banner_start_date: startImmediately ? "" : formatDateTimeInput(new Date()),
            banner_end_date: startImmediately && currentValues.banner_end_date
                ? currentValues.banner_end_date
                : currentValues.banner_end_date,
        }));
        setStatus(null);
    }

    async function handleSubmit(submitEvent) {
        submitEvent.preventDefault();
        setStatus(null);

        const nextTouched = {
            banner_title: true,
            banner_message: true,
            banner_start_date: true,
            banner_end_date: true,
            banner_enabled: true,
        };

        setTouched(nextTouched);

        const nextErrors = await validateForm(values);
        if (Object.keys(nextErrors).length > 0) {
            setStatus({ type: "danger", message: "Fix the highlighted fields before saving." });
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/sitebanner", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                    banner_title: values.banner_title.trim(),
                    banner_message: values.banner_message,
                    banner_enabled: values.banner_enabled,
                    banner_start_date: values.banner_start_date
                        ? new Date(values.banner_start_date).toISOString()
                        : null,
                    banner_end_date: values.banner_end_date
                        ? new Date(values.banner_end_date).toISOString()
                        : null,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok || payload?.ok === false) {
                throw new Error(payload?.error?.message || payload?.message || "Unable to update the banner.");
            }

            await mutate("/api/sitebanner");
            setStatus({ type: "success", message: "Banner settings updated." });
        } catch (error) {
            setStatus({ type: "danger", message: error.message || "Unable to update the banner." });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <Card bg="dark" text="light" border="secondary">
                <Card.Body className="text-center py-5">
                    <Spinner animation="border" role="status" className="mb-3" />
                    <div>Loading banner settings…</div>
                </Card.Body>
            </Card>
        );
    }

    if (messageError) {
        return <Alert variant="danger">Unable to load the current site banner.</Alert>;
    }

    const bannerStatus = getBannerStatus(values);
    const startsImmediately = !values.banner_start_date;
    const isOpenEnded = !values.banner_end_date;
    const lastUpdated = initialValues.banner_update_date
        ? new Date(initialValues.banner_update_date).toLocaleString()
        : "Not updated yet";

    return (
        <Row className="g-4 align-items-start">
            <Col lg={5}>
                <Card bg="dark" text="light" border="secondary" className="shadow-sm h-100">
                    <Card.Body>
                        <Stack direction="horizontal" className="justify-content-between align-items-start mb-3 gap-3">
                            <div>
                                <Card.Title className="mb-1">Current banner</Card.Title>
                                <Card.Text className="text-secondary mb-0">Preview the saved banner state and schedule.</Card.Text>
                            </div>
                            <Badge bg={bannerStatus.variant}>{bannerStatus.label}</Badge>
                        </Stack>

                        <Alert variant={bannerStatus.variant} className="mb-3">
                            <div className="fw-semibold mb-1">{values.banner_title || "Untitled banner"}</div>
                            <div className="mb-2">{values.banner_message || "No message has been set yet."}</div>
                            <div className="small mb-0">{bannerStatus.description}</div>
                        </Alert>

                        <dl className="mb-0">
                            <dt className="text-secondary">Starts</dt>
                            <dd>{formatScheduleDate(values.banner_start_date, "Immediately")}</dd>
                            <dt className="text-secondary">Ends</dt>
                            <dd>{formatScheduleDate(values.banner_end_date, "No end date")}</dd>
                            <dt className="text-secondary">Last updated</dt>
                            <dd className="mb-0">{lastUpdated}</dd>
                        </dl>
                    </Card.Body>
                </Card>
            </Col>

            <Col lg={7}>
                <Card bg="dark" text="light" border="secondary" className="shadow-sm">
                    <Card.Body>
                        <Card.Title className="mb-1">Edit site banner</Card.Title>
                        <Card.Text className="text-secondary mb-3">Update the title, message, schedule, and visibility in one place.</Card.Text>

                        {status ? (
                            <Alert variant={status.type} className="mb-3">
                                {status.message}
                            </Alert>
                        ) : null}

                        <Form onSubmit={handleSubmit} noValidate>
                            <Row className="g-3">
                                <Col xs={12}>
                                    <Form.Label htmlFor="banner_title">Banner title</Form.Label>
                                    <Form.Control
                                        id="banner_title"
                                        value={values.banner_title}
                                        onChange={(changeEvent) => updateValue("banner_title", changeEvent.target.value)}
                                        onBlur={() => handleBlur("banner_title")}
                                        isInvalid={Boolean(touched.banner_title && errors.banner_title)}
                                        placeholder="Site update"
                                    />
                                    <Form.Control.Feedback type="invalid">{errors.banner_title}</Form.Control.Feedback>
                                </Col>

                                <Col xs={12}>
                                    <Form.Label htmlFor="banner_message">Banner message</Form.Label>
                                    <Form.Control
                                        id="banner_message"
                                        as="textarea"
                                        rows={6}
                                        value={values.banner_message}
                                        onChange={(changeEvent) => updateValue("banner_message", changeEvent.target.value)}
                                        onBlur={() => handleBlur("banner_message")}
                                        isInvalid={Boolean(touched.banner_message && errors.banner_message)}
                                        placeholder="Describe what visitors need to know right now."
                                    />
                                    <Form.Control.Feedback type="invalid">{errors.banner_message}</Form.Control.Feedback>
                                </Col>

                                <Col md={6}>
                                    <Form.Label htmlFor="banner_start_date">Start</Form.Label>
                                    <Form.Control
                                        id="banner_start_date"
                                        type="datetime-local"
                                        value={values.banner_start_date}
                                        onChange={(changeEvent) => updateValue("banner_start_date", changeEvent.target.value)}
                                        onBlur={() => handleBlur("banner_start_date")}
                                        isInvalid={Boolean(touched.banner_start_date && errors.banner_start_date)}
                                        disabled={startsImmediately}
                                    />
                                    <Form.Control.Feedback type="invalid">{errors.banner_start_date}</Form.Control.Feedback>
                                    <Form.Text className="text-secondary">
                                        {startsImmediately ? "The banner will appear as soon as it is enabled." : "Set a future start time to schedule the banner."}
                                    </Form.Text>
                                </Col>

                                <Col md={6}>
                                    <Form.Label htmlFor="banner_end_date">End</Form.Label>
                                    <Form.Control
                                        id="banner_end_date"
                                        type="datetime-local"
                                        value={values.banner_end_date}
                                        onChange={(changeEvent) => updateValue("banner_end_date", changeEvent.target.value)}
                                        onBlur={() => handleBlur("banner_end_date")}
                                        isInvalid={Boolean(touched.banner_end_date && errors.banner_end_date)}
                                        disabled={isOpenEnded}
                                    />
                                    <Form.Control.Feedback type="invalid">{errors.banner_end_date}</Form.Control.Feedback>
                                    <Form.Text className="text-secondary">
                                        {isOpenEnded ? "This banner will stay live until you hide it." : "Leave unchecked to use a fixed end date."}
                                    </Form.Text>
                                </Col>

                                <Col xs={12}>
                                    <Form.Check
                                        id="banner_start_immediately"
                                        type="switch"
                                        label="Start immediately"
                                        checked={startsImmediately}
                                        onChange={(changeEvent) => handleStartImmediatelyToggle(changeEvent.target.checked)}
                                    />
                                    <Form.Text className="text-secondary">Use this for banners that should go live as soon as you enable them.</Form.Text>
                                </Col>

                                <Col xs={12}>
                                    <Form.Check
                                        id="banner_open_ended"
                                        type="switch"
                                        label="No end date"
                                        checked={isOpenEnded}
                                        onChange={(changeEvent) => handleOpenEndedToggle(changeEvent.target.checked)}
                                    />
                                    <Form.Text className="text-secondary">Use this for banners that should stay visible until you turn them off.</Form.Text>
                                </Col>

                                <Col xs={12}>
                                    <Form.Check
                                        id="banner_enabled"
                                        type="switch"
                                        label="Show banner on the homepage"
                                        checked={values.banner_enabled}
                                        onChange={(changeEvent) => updateValue("banner_enabled", changeEvent.target.checked)}
                                        onBlur={() => handleBlur("banner_enabled")}
                                    />
                                    <Form.Text className="text-secondary">Turn this off to hide the banner without losing the saved message.</Form.Text>
                                </Col>
                            </Row>

                            <Stack direction="horizontal" gap={2} className="mt-4 flex-wrap">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Saving…" : "Save banner"}
                                </Button>
                                <Button variant="outline-light" type="button" onClick={resetForm} disabled={isSubmitting}>
                                    Reset
                                </Button>
                            </Stack>
                        </Form>
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    );
}
