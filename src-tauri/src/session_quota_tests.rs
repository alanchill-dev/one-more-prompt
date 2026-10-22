use super::*;
fn requests() -> Vec<SessionQuotaRequest> {
    vec![SessionQuotaRequest {
        thread_id: "00000000-0000-0000-0000-000000000001".into(),
        created_at: "2026-09-22T00:00:00Z".into(),
        descendant_thread_ids: vec![],
    }]
}
fn response(status: &str, percent: serde_json::Value) -> serde_json::Value {
    serde_json::json!({"data_as_of":"2026-09-22T08:00:00Z","comparison_plan":null,
        "threads":[{"thread_id":requests()[0].thread_id,"data_status":status,"weekly_limit_percent":percent}]})
}
fn normalize(value: serde_json::Value) -> Result<SessionQuotaResponse, String> {
    normalize_response(value.to_string().as_bytes(), &requests())
}
#[test]
fn preserves_zero_and_values_above_one_hundred() {
    for (status, percent) in ["available", "partial"]
        .into_iter()
        .flat_map(|status| [0.0, 10.0, 151.52].map(|percent| (status, percent)))
    {
        assert_eq!(
            normalize(response(status, serde_json::json!(percent)))
                .unwrap()
                .entries[0]
                .weekly_percent,
            Some(percent)
        );
    }
}
#[test]
fn unavailable_and_null_never_become_zero() {
    for status in ["available", "partial", "unavailable"] {
        assert_eq!(
            normalize(response(status, serde_json::Value::Null))
                .unwrap()
                .entries[0]
                .weekly_percent,
            None
        );
    }
}
#[test]
fn rejects_unknown_status_invalid_numbers_and_contradictions() {
    assert!(normalize(response("unknown", serde_json::Value::Null)).is_err());
    for percent in [
        serde_json::json!(-0.1),
        serde_json::json!("NaN"),
        serde_json::json!("10"),
    ] {
        for status in ["available", "partial"] {
            assert!(normalize(response(status, percent.clone())).is_err());
        }
    }
    assert!(normalize(response("unavailable", serde_json::json!(10))).is_err());
}
#[test]
fn mixed_partial_data_preserves_other_sessions() {
    let mut threads = requests();
    for id in [2, 3] {
        let mut thread = threads[0].clone();
        thread.thread_id = format!("00000000-0000-0000-0000-{id:012}");
        threads.push(thread);
    }
    let rows: Vec<_> = threads.iter().zip([
        ("available", serde_json::json!(6)),
        ("partial", serde_json::json!(4)),
        ("unavailable", serde_json::Value::Null),
    ]).map(|(thread, (status, percent))| serde_json::json!({
        "thread_id": thread.thread_id, "data_status": status, "weekly_limit_percent": percent,
    })).collect();
    let bytes =
        serde_json::json!({"data_as_of": "2026-10-15T09:00:00Z", "threads": rows}).to_string();
    let result = normalize_response(bytes.as_bytes(), &threads).unwrap();
    assert_eq!(result.entries.len(), 3);
    assert_eq!(result.entries[0].weekly_percent, Some(6.0));
    assert_eq!(result.entries[1].weekly_percent, Some(4.0));
    assert_eq!(result.entries[1].status, SessionQuotaStatus::Partial);
    assert_eq!(result.entries[2].weekly_percent, None);
}
#[test]
fn rejects_missing_duplicate_and_unrequested_rows() {
    let mut value = response("available", serde_json::json!(10));
    value["threads"] = serde_json::json!([]);
    assert!(normalize(value).is_err());
    let mut value = response("available", serde_json::json!(10));
    let duplicate = value["threads"][0].clone();
    value["threads"].as_array_mut().unwrap().push(duplicate);
    assert!(normalize(value).is_err());
    let mut value = response("available", serde_json::json!(10));
    value["threads"][0]["thread_id"] = serde_json::json!("unexpected");
    assert!(normalize(value).is_err());
    let mut value = response("available", serde_json::json!(10));
    value["threads"][0]
        .as_object_mut()
        .unwrap()
        .remove("weekly_limit_percent");
    assert!(normalize(value).is_err());
}
#[test]
fn request_rejects_overlapping_groups_and_oversized_batches() {
    let mut rows = requests();
    let id = rows[0].thread_id.clone();
    rows[0].descendant_thread_ids.push(id);
    assert!(validate_request(&rows).is_err());
    assert!(validate_request(&vec![requests()[0].clone(); MAX_PROJECT_SESSIONS + 1]).is_err());
    assert!(validate_request(&requests()).is_ok());
}
#[test]
fn rejects_malformed_timestamps() {
    let mut rows = requests();
    rows[0].created_at = "yesterday".into();
    assert!(validate_request(&rows).is_err());
    for timestamp in [
        serde_json::json!("2026-99-22T00:00:00Z"),
        serde_json::json!(""),
        serde_json::json!(123),
        serde_json::json!(false),
        serde_json::json!([]),
        serde_json::json!({}),
    ] {
        let mut value = response("available", serde_json::json!(10));
        value["data_as_of"] = timestamp;
        assert!(normalize(value).is_err());
    }
    let mut value = response("available", serde_json::json!(10));
    value.as_object_mut().unwrap().remove("data_as_of");
    assert!(normalize(value).is_err());
}
#[test]
fn merges_batches_using_oldest_instant() {
    let mut total = normalize(response("available", serde_json::json!(10))).unwrap();
    let mut next = normalize(response("available", serde_json::json!(20))).unwrap();
    next.data_as_of = Some("2026-09-22T09:00:00+02:00".into());
    merge_response(&mut total, next);
    assert_eq!(
        total.data_as_of.as_deref(),
        Some("2026-09-22T09:00:00+02:00")
    );
    assert_eq!(total.entries.len(), 2);
}
#[test]
fn extracts_only_auth_fields_and_handles_keychain_hex() {
    let raw = br#"{"tokens":{"access_token":"secret","account_id":"account"}}"#;
    let auth = parse_credentials(raw).unwrap();
    assert_eq!(auth.token.as_deref(), Some("secret"));
    assert_eq!(auth.account.as_deref(), Some("account"));
    let hex = raw.iter().map(|b| format!("{b:02x}")).collect::<String>();
    assert!(parse_credentials(hex.as_bytes()) == Some(auth));
    assert!(
        parse_credentials(br#"{"OPENAI_API_KEY":"key"}"#)
            .unwrap()
            .token
            .is_none()
    );
}

#[test]
fn accepts_explicit_null_timestamp_without_changing_entries() {
    for (status, percent) in [
        ("unavailable", serde_json::Value::Null),
        ("partial", serde_json::json!(57.376)),
        ("available", serde_json::json!(0.0)),
    ] {
        let mut value = response(status, percent.clone());
        value["data_as_of"] = serde_json::Value::Null;
        let result =
            normalize(value).expect("An explicit null timestamp is a valid official response");
        let serialized = serde_json::to_value(result).unwrap();
        assert_eq!(serialized["dataAsOf"], serde_json::Value::Null);
        assert_eq!(serialized["entries"][0]["weeklyPercent"], percent);
        assert_eq!(serialized["entries"][0]["status"], status);
    }
}

#[test]
fn initializes_empty_accumulator_from_first_batch_time() {
    for timestamp in [
        serde_json::Value::Null,
        serde_json::json!("2026-09-22T08:00:00Z"),
    ] {
        let mut value = response("partial", serde_json::json!(57.376));
        value["data_as_of"] = timestamp.clone();
        let next = normalize(value).unwrap();
        let mut total = SessionQuotaResponse {
            data_as_of: None,
            entries: Vec::new(),
        };
        merge_response(&mut total, next);
        let serialized = serde_json::to_value(total).unwrap();
        assert_eq!(serialized["dataAsOf"], timestamp);
        assert_eq!(serialized["entries"][0]["weeklyPercent"], 57.376);
        assert_eq!(serialized["entries"][0]["status"], "partial");
    }
}

#[test]
fn null_batch_time_stays_unknown_in_both_orders_and_after_later_known_batch() {
    for timestamps in [
        [Some("2026-09-22T08:00:00Z"), None],
        [None, Some("2026-09-22T08:00:00Z")],
        [None, None],
    ] {
        let mut total = SessionQuotaResponse {
            data_as_of: None,
            entries: Vec::new(),
        };
        for (timestamp, (status, percent)) in timestamps.into_iter().zip([
            ("available", serde_json::json!(0)),
            ("partial", serde_json::json!(57.376)),
        ]) {
            let mut value = response(status, percent);
            value["data_as_of"] = serde_json::json!(timestamp);
            merge_response(&mut total, normalize(value).unwrap());
        }
        assert_eq!(total.data_as_of, None);
        merge_response(
            &mut total,
            normalize(response("unavailable", serde_json::Value::Null)).unwrap(),
        );
        assert_eq!(total.data_as_of, None);
        assert_eq!(
            total
                .entries
                .iter()
                .map(|entry| (&entry.status, entry.weekly_percent))
                .collect::<Vec<_>>(),
            vec![
                (&SessionQuotaStatus::Available, Some(0.0)),
                (&SessionQuotaStatus::Partial, Some(57.376)),
                (&SessionQuotaStatus::Unavailable, None),
            ]
        );
    }
}

fn project_requests(count: usize) -> Vec<SessionQuotaRequest> {
    (1..=count)
        .map(|id| SessionQuotaRequest {
            thread_id: uuid::Uuid::from_u128(id as u128).to_string(),
            created_at: "2026-10-01T00:00:00Z".into(),
            descendant_thread_ids: vec![],
        })
        .collect()
}

fn batch_response(body: &str, data_as_of: serde_json::Value) -> Vec<u8> {
    let request: serde_json::Value = serde_json::from_str(body).unwrap();
    serde_json::json!({
        "data_as_of": data_as_of,
        "threads": request["threads"].as_array().unwrap().iter().map(|thread| {
            serde_json::json!({
                "thread_id": thread["thread_id"],
                "data_status": "available",
                "weekly_limit_percent": 1.0
            })
        }).collect::<Vec<_>>()
    })
    .to_string()
    .into_bytes()
}

#[test]
fn large_projects_keep_a_bounded_limit_and_validate_overlap_across_http_batches() {
    for count in [500, 501, MAX_PROJECT_SESSIONS] {
        assert!(validate_request(&project_requests(count)).is_ok());
    }
    assert!(validate_request(&project_requests(MAX_PROJECT_SESSIONS + 1)).is_err());
    let mut threads = project_requests(501);
    let descendant = threads[500].thread_id.clone();
    threads[0].descendant_thread_ids.push(descendant);
    assert!(validate_request(&threads).is_err());
    let mut threads = project_requests(501);
    threads[500].thread_id = threads[0].thread_id.clone();
    assert!(validate_request(&threads).is_err());
}

#[test]
fn large_projects_use_thirteen_bounded_http_batches_and_merge_every_entry_once() {
    for count in [500, 501] {
        let threads = project_requests(count);
        let mut sizes = Vec::new();
        let response = fetch_batches(
            &threads,
            Instant::now() + PROJECT_QUERY_TIMEOUT,
            |body, _timeout| {
                let request: serde_json::Value = serde_json::from_str(body).unwrap();
                sizes.push(request["threads"].as_array().unwrap().len());
                Ok(Some(batch_response(
                    body,
                    serde_json::json!("2026-10-01T08:00:00Z"),
                )))
            },
            || true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            sizes,
            [vec![HTTP_BATCH_SESSIONS; 12], vec![count - 480]].concat()
        );
        assert_eq!(response.entries.len(), count);
        let ids: HashSet<_> = response
            .entries
            .iter()
            .map(|entry| &entry.thread_id)
            .collect();
        assert_eq!(ids.len(), count);
        assert!(threads.iter().all(|thread| ids.contains(&thread.thread_id)));
        assert!(
            response
                .entries
                .iter()
                .all(|entry| entry.weekly_percent == Some(1.0))
        );
    }
}

#[test]
fn project_batches_keep_the_oldest_instant_and_any_unknown_timestamp() {
    for times in [
        vec![
            serde_json::json!("2026-10-01T08:00:00Z"),
            serde_json::json!("2026-10-01T09:00:00+02:00"),
            serde_json::json!("2026-10-01T10:00:00Z"),
        ],
        vec![
            serde_json::json!("2026-10-01T08:00:00Z"),
            serde_json::Value::Null,
            serde_json::json!("2026-10-01T10:00:00Z"),
        ],
    ] {
        let expected = if times[1].is_null() {
            None
        } else {
            Some("2026-10-01T09:00:00+02:00".to_owned())
        };
        let mut times = times.into_iter();
        let response = fetch_batches(
            &project_requests(81),
            Instant::now() + PROJECT_QUERY_TIMEOUT,
            |body, _timeout| Ok(Some(batch_response(body, times.next().unwrap()))),
            || true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(response.entries.len(), 81);
        assert_eq!(response.data_as_of, expected);
    }
}

#[test]
fn a_failed_or_unauthorized_batch_never_returns_the_partial_project() {
    for unauthorized in [false, true] {
        let mut sent = 0;
        let response = fetch_batches(
            &project_requests(81),
            Instant::now() + PROJECT_QUERY_TIMEOUT,
            |body, _timeout| {
                sent += 1;
                if sent == 2 {
                    return if unauthorized {
                        Ok(None)
                    } else {
                        Err("synthetic HTTP failure".into())
                    };
                }
                Ok(Some(batch_response(body, serde_json::Value::Null)))
            },
            || true,
        );
        assert_eq!(sent, 2);
        if unauthorized {
            assert!(response.unwrap().is_none());
        } else {
            assert_eq!(response.unwrap_err(), "synthetic HTTP failure");
        }
    }
}

#[test]
fn account_changes_before_during_or_between_batches_discard_the_project() {
    use std::cell::Cell;
    for change_at_check in [0, 1, 2] {
        let checks = Cell::new(0);
        let sent = Cell::new(0);
        let response = fetch_batches(
            &project_requests(81),
            Instant::now() + PROJECT_QUERY_TIMEOUT,
            |body, _timeout| {
                sent.set(sent.get() + 1);
                Ok(Some(batch_response(body, serde_json::Value::Null)))
            },
            || {
                let current = checks.get();
                checks.set(current + 1);
                current < change_at_check
            },
        );
        assert_eq!(response.unwrap_err(), SIGN_IN_CHANGED);
        assert_eq!(sent.get(), usize::from(change_at_check > 0));
    }
}

#[test]
fn an_expired_project_deadline_never_sends_a_request() {
    let mut sent = 0;
    let response = fetch_batches(
        &requests(),
        Instant::now() - Duration::from_secs(1),
        |_body, _timeout| {
            sent += 1;
            Ok(None)
        },
        || true,
    );
    assert_eq!(response.unwrap_err(), PROJECT_TIMED_OUT);
    assert_eq!(sent, 0);
}

#[test]
fn every_http_request_receives_the_smaller_remaining_project_budget() {
    for remaining in [Duration::from_secs(5), Duration::from_secs(60)] {
        let mut sent = 0;
        let response = fetch_batches(
            &requests(),
            Instant::now() + remaining,
            |body, timeout| {
                sent += 1;
                assert!(!timeout.is_zero());
                assert!(timeout <= remaining.min(HTTP_TIMEOUT));
                if remaining >= HTTP_TIMEOUT {
                    assert_eq!(timeout, HTTP_TIMEOUT);
                }
                Ok(Some(batch_response(body, serde_json::Value::Null)))
            },
            || true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(sent, 1);
        assert_eq!(response.entries.len(), 1);
    }
}
