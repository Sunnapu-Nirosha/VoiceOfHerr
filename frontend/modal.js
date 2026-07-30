document.addEventListener('DOMContentLoaded', function () {
  var cards = document.querySelectorAll('[data-video]');
  cards.forEach(function (card) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      var id = card.getAttribute('data-video');
      if (!id) return;
      window.open('https://www.youtube.com/watch?v=' + id, '_blank');
    });
  });
});
