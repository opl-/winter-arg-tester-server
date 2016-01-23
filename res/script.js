$(function() {
	$('#add_button').click(function() {
		if ($('#add_input').val().trim().length === 0) return $('#add_info').empty().append($('<div>').text('Enter a password to test.'));

		$('#add_info').empty().append($('<div>').text('Searching...'));

		$.ajax({
			method: 'POST',
			url: '/add',
			contentType: 'application/json',
			data: JSON.stringify({
				password: $('#add_input').val().trim(),
				recaptchaResponse: grecaptcha.getResponse()
			})
		}).done(function() {
			$('#add_info').empty().append($('<div>').text('Added the password to the queue.'));
			$('#recaptcha').removeClass('show');
		}).fail(function(data) {
			try {
				var resp = JSON.parse(data.responseText);
				if (resp.status === 'already_exists') {
					var $addInfo = $('#add_info').empty();
					if (resp.data.results.length === 0) {
						$addInfo.append($('<div>').text('Already in queue...'));
					} else {
						for (var i = 0; i < resp.data.results.length; i++) {
							var d = resp.data.results[i];
							$addInfo.append(
								$('<div>').append(
									$('<div class="small">').append(
										d.valid ? undefined : [
											$('<b>').text('Invalidated'),
											' &#8226; '
										]
									).append(
										$('<b>').text(d.result === '[]' ? 'Nothing unusual' : !d.solved ? 'Not solved' : 'Unusual response')
									).append(
										' &#8226; '
									).append(
										$('<span title="Requested">').text(new Date(d.requested * 1000 - 3600000).toLocaleString())
									).append(!d.solved ? undefined : [
										' &#8226; ',
										$('<span title="Solved">').text(new Date(d.solved * 1000 - 3600000).toLocaleString())
									])
								).append(
									$('<div>').text(d.result)
								)
							);
						}
					}
				} else if (resp.status === 'recaptcha_required') {
					grecaptcha.reset();
					if ($('#recaptcha').hasClass('show')) {
						$('#add_info').empty().append($('<div>').text('Invalid recaptcha.'));
					} else {
						$('#recaptcha').addClass('show');
						$('#add_info').empty().append($('<div>').text('Password not tested. Solve the captcha to add it to the queue.'));
					}
				} else {
					$('#add_info').empty().append($('<div>').text('Failed. (' + resp.status + ')'));
				}
			} catch (e) {
				$('#add_info').empty().append($('<div>').text('Exception. Check console.'));
				console.log(data);
				console.error(e);
			}
		});
	});

	function getStats() {
		$.get('/stats').done(function(data) {
			if (data.status === 'success') {
				$('#passwords_solved').text(data.data.solved);
				$('#passwords_total').text(data.data.total);
				$('#passwords_perc').text(~~((data.data.solved / data.data.total) * 1000) / 10);
			}
		});
	}

	getStats();
	//setInterval(getStats, 30000);

	function getHits() {
		$.get('/hits').done(function(data) {
			if (data.status === 'success') {
				var $hits = $('#hits').empty();
				for (var i = 0; i < data.data.length; i++) {
					var d = data.data[i];
					if (!d.valid) continue;

					$hits.append(
						$('<div>').append(
							$('<div class="small">').append(
								$('<span title="Requested">').text(new Date(d.requested * 1000 - 3600000).toLocaleString())
							).append(
								' &#8226; '
							).append(
								$('<span title="Solved">').text(new Date(d.solved * 1000 - 3600000).toLocaleString())
							)
						).append(
							$('<div>').append(
								$('<b>').text(d.password)
							).append('<br/>').append(
								$('<span>').text(d.result)
							)
						)
					);
				}
			}
		});
	}

	getHits();
	setInterval(getHits, 120000);

	/*setInterval(function() {
		var t = ~~((new Date().getTime() - 1451574201943) / 1000);

		$('#opl-h').text(~~(t / 60 / 60));
		$('#opl-m').text(~~((t / 60) % 60));
		$('#opl-s').text(t % 60);
	}, 1000);*/
});