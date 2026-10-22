use std::io::Read;
use std::net::TcpStream;
use std::time::{Duration, Instant};

const MAX_HEADER_BYTES: usize = 4096;

#[derive(Debug)]
pub(super) enum RequestError {
    BadRequest,
    Forbidden,
    TooLarge,
    Timeout,
}

pub(super) struct Request<'a> {
    pub method: &'a str,
    pub target: &'a str,
    pub origin: Option<&'a str>,
}

pub(super) fn read_head(stream: &mut TcpStream, timeout: Duration) -> Result<String, RequestError> {
    let deadline = Instant::now() + timeout;
    let mut buffer = [0_u8; MAX_HEADER_BYTES];
    let mut used = 0;
    loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(RequestError::Timeout)?;
        stream
            .set_read_timeout(Some(remaining))
            .map_err(|_| RequestError::BadRequest)?;
        let count = match stream.read(&mut buffer[used..]) {
            Ok(0) => return Err(RequestError::BadRequest),
            Ok(count) => count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                return Err(RequestError::Timeout);
            }
            Err(_) => return Err(RequestError::BadRequest),
        };
        used += count;
        if let Some(end) = buffer[..used]
            .windows(4)
            .position(|part| part == b"\r\n\r\n")
        {
            return std::str::from_utf8(&buffer[..end + 4])
                .map(str::to_owned)
                .map_err(|_| RequestError::BadRequest);
        }
        if used == MAX_HEADER_BYTES {
            return Err(RequestError::TooLarge);
        }
    }
}

fn is_token(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte)
}

pub(super) fn parse(head: &str) -> Result<Request<'_>, RequestError> {
    let head = head
        .strip_suffix("\r\n\r\n")
        .ok_or(RequestError::BadRequest)?;
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next().ok_or(RequestError::BadRequest)?.split(' ');
    let method = request_line.next().ok_or(RequestError::BadRequest)?;
    let target = request_line.next().ok_or(RequestError::BadRequest)?;
    let version = request_line.next().ok_or(RequestError::BadRequest)?;
    if method.is_empty()
        || !method.bytes().all(is_token)
        || !target.starts_with('/')
        || !target.bytes().all(|byte| byte.is_ascii_graphic())
        || !matches!(version, "HTTP/1.0" | "HTTP/1.1")
        || request_line.next().is_some()
    {
        return Err(RequestError::BadRequest);
    }

    let mut host = None;
    let mut origin = None;
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(RequestError::BadRequest)?;
        if name.is_empty()
            || !name.bytes().all(is_token)
            || value
                .bytes()
                .any(|byte| (byte < 0x20 && byte != b'\t') || byte == 0x7f)
        {
            return Err(RequestError::BadRequest);
        }
        let value = value.trim_matches([' ', '\t']);
        if name.eq_ignore_ascii_case("host") && host.replace(value).is_some() {
            return Err(RequestError::BadRequest);
        }
        if name.eq_ignore_ascii_case("origin") && origin.replace(value).is_some() {
            return Err(RequestError::BadRequest);
        }
    }
    let host = host
        .filter(|host| !host.is_empty())
        .ok_or(RequestError::BadRequest)?;
    if !["127.0.0.1:6736", "localhost:6736"]
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
    {
        return Err(RequestError::Forbidden);
    }
    if let Some(origin) = origin {
        if ![
            "http://127.0.0.1:6736",
            "http://localhost:6736",
            "http://127.0.0.1",
            "http://localhost",
        ]
        .iter()
        .any(|allowed| origin.eq_ignore_ascii_case(allowed))
        {
            return Err(RequestError::Forbidden);
        }
    }
    Ok(Request {
        method,
        target,
        origin,
    })
}
