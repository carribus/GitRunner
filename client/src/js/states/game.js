/**
 * Created by petermares on 20/02/2016.
 */

module.exports = (function() {
    var settings = require('../../settings');
    var o = {};
    var _tiles = {
        tile_grass: 'assets/grass_128x128.png',
        tile_sky: 'assets/sky.png'
    };
    var player;
    var state = 'waiting';
    var platforms;
    var level;
    var numJumps = 0;
    var serverLabel, gameOverLabel;
    var deathEmitter, jumpEmitter;
    var scoreText;
    var cursors, spacebar;
    var music, jump, drop, drop_end, soundsEnabled = true;

    // temporary usage..
    var grayFilter;

    o.preload = function() {
        console.log('Game.preload');

        this.game.stage.backgroundColor = '#000';

        // load images
        for (var k in _tiles) {
            this.load.image(k, _tiles[k]);
        }

        this.game.load.json('level', 'http://' + settings.server.host + ':' + settings.server.port + '/player/' + settings.playerID + '/level');

        this.game.load.audio('guitar', 'assets/sounds/guitar.ogg');
        this.game.load.audio('jump', 'assets/sounds/jump.ogg');
        this.game.load.audio('drop', 'assets/sounds/drop.ogg');
        this.game.load.audio('drop_end', 'assets/sounds/drop_end.ogg');

        // temporary usage..
        this.game.load.script('gray', 'https://cdn.rawgit.com/photonstorm/phaser/master/filters/Gray.js');
    };

    o.create = function() {
        console.log('Game.create');

        cursors = this.game.input.keyboard.createCursorKeys();
        cursors.spacebar = this.game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

        music = this.game.add.audio('guitar', 1, true);
        jump = this.game.add.audio('jump', 1);
        drop = this.game.add.audio('drop', 1);
        drop_end = this.game.add.audio('drop_end', 1);

        // temporary usage..
        grayFilter = this.game.add.filter('Gray');

        level = this.game.cache.getJSON('level');

        var imgData = new Image();
        imgData.src = level.avatar;
        this.game.cache.addImage('repo-avatar', level.avatar, imgData);

        var serverVersion = this.game.cache.getJSON('server_version');

        var sky = this.game.add.sprite(0, 0, 'sky');
        sky.width = settings.display.width;

        platforms = this.game.add.group();
        platforms.enableBody = true;

        obstacles = this.game.add.group();
        obstacles.enableBody = true;

        var ground, obstacle;
        for ( var i = 1; i <= level.size; i++ ) {
            var _i = i, expected_position;
            if (level.gaps) {
                expected_position = Math.floor(level.size / level.gaps);
                if(expected_position * 64 < 300) level.obstacles--;

                if(i == expected_position) {
                    console.log('generating gap at position: ' + i * 64);

                    level.gaps--;
                    _i += 2;
                } else {
                    ground = platforms.create((i-1) * 64, this.game.world.height-64, 'tile_grass');
                    ground.body.immovable = true;
                    ground.scale.set(0.5, 0.5);
                    ground.body.friction.x = 0;
                }
            }

            if(level.obstacles) {
                expected_position = Math.floor(level.size / level.obstacles);
                if(expected_position * 64 < 300) level.obstacles--;

                rnd_position = i + Math.floor(Math.random() * ((expected_position + 5) - (expected_position - 5)) + (expected_position - 5));
                if(i === rnd_position) {
                    console.log('generating obstacle at position: ' + i * 64);

                    level.obstacles--;

                    obstacle = obstacles.create((i-1) * 64, this.game.world.height-135, 'obstacles');
                    obstacle.body.immovable = true;
                    obstacle.scale.set(0.5, 0.5);
                    obstacle.body.friction.x = 0;
                }
            }

            i = _i;
        }

        // create the avatar image
        //this.game.add.sprite(this.game.world.centerX, this.game.world.centerY, 'repo-avatar');
        var avatar = platforms.create(this.game.world.centerX, 64, 'repo-avatar');
        avatar.scale.set(0.5, 0.5);

        // create the player
        player = this.game.add.sprite(256, 0, 'dude');
        this.game.physics.arcade.enable(player);
        player.body.bounce.y = 0;
        player.body.gravity.y = 350;
        player.body.collideWorldBounds = true;
        player.animations.add('right', [1, 2, 3, 4], 10, true);
        player.animations.add('jump', [5, 6], 10, true);
        player.animations.add('fall', [0], 10, true);

        // text
        serverLabel = this.game.add.text(8, 8, getServerVersion(serverVersion), {fontSize: '24', fill: '#000' });
        gameOverLabel = this.game.add.text(this.game.world.centerX, this.game.world.centerY, 'Game Over', {font: 'bold 96pt arial', fill: '#F00'});
        gameOverLabel.anchor.set(0.5);
        gameOverLabel.visible = false;
        scoreText = this.game.add.text(0, 0, returnCurrentScore(0), {
            font: '30px Arial',
            fill: '#000',
            align: 'center',
            boundsAlignH: 'left',
            boundsAlignV: 'top',
            backgroundColor: '#999'
        });
        scoreText.setTextBounds(50, 30, 150, 0);

        // emitters
        jumpEmitter = this.game.add.emitter(this.game.world.centerX, 0);
        jumpEmitter.makeParticles('star');
        jumpEmitter.gravity = 400;
        jumpEmitter.setAlpha(0, 1);
        jumpEmitter.setScale(0.5, 0.75, 0.5, 0.75);

        deathEmitter = this.game.add.emitter(this.game.world.centerX, 0, 100);
        deathEmitter.makeParticles('heart');
        deathEmitter.gravity = 300;

        startButton = this.game.add.button(this.game.world.width - 60, 30, 'diamond', playPauseSound, this);
    };

    o.update = function() {
        if (!music.isPlaying && soundsEnabled) {
            music.play();
            drop.play();
        }

        this.game.physics.arcade.collide(player, platforms);
        this.game.physics.arcade.collide(player, obstacles, onObstacleCollide);
        switch (state) {
            case 'waiting':
                if (player.body.touching.down) {
                    state = 'running';
                    if(soundsEnabled) drop_end.play();
                }
                break;

            case 'running':
                this.run();
                break;

            case 'dead':
                gameOverLabel.visible = true;
                var scale = player.scale;
                if ( scale.x > 0 ) {
                    scale.x -= 0.05;
                    scale.y -= 0.05;
                    player.scale = scale;
                }
                break;
        }
    };

    function onObstacleCollide(player, obstacle) {
        killPlayer();
    }

    o.run = function() {
        var isJumping = !player.body.touching.down;
        var runSpeed = 150;

        runSpeed += Math.abs(platforms.children[0].x) / 64;

        updateRunnerSpeedTo(runSpeed);

        if (player.body.bottom >= settings.display.height || player.body.touching.right) {
            // kill the player and end the game
            killPlayer();
        }

        scoreText.setText(returnCurrentScore(parseInt(runSpeed)));

        if (cursors.up.isDown || cursors.spacebar.isDown) {
            // enable a single and double jump.
            // doubleJumps are only allowed on a certain part of the initial jump arc
            if ( player.body.velocity.y > -100 && numJumps < 1 ) {
                player.body.velocity.y = -250;
                if(soundsEnabled) jump.play();
                numJumps++;

                jumpEmitter.x = player.worldPosition.x + player.width/2;
                jumpEmitter.y = player.worldPosition.y + player.height/2;
                jumpEmitter.start(true, 1000, null, 15);
            }
        }
        if (cursors.down.isDown) {
            player.body.velocity.y = 800;
        }

        if (isJumping) {
            player.animations.play('jump');
        } else {
            player.animations.play('right');
            numJumps = 0;
        }
    };

    function playPauseSound() {
        if(music.isPlaying) {
            soundsEnabled = false;
            music.pause();
            startButton.filters = [grayFilter];
        } else {
            music.play();
            startButton.filters = null;
        }
    }

    function updateRunnerSpeedTo(speed) {
        platforms.forEach(function(ground) {
            ground.body.velocity.x = -speed;
        }, this);

        obstacles.forEach(function(obstacle, index) {
            obstacle.body.velocity.x = -speed;
        }, this);
    }

    function killPlayer() {
        state = 'dead';
        updateRunnerSpeedTo(0);
        deathEmitter.x = player.worldPosition.x + player.width/2;
        deathEmitter.y = player.worldPosition.y + player.height/2;
        deathEmitter.start(true, 2000, null, 15);
    }

    function returnCurrentScore(score) {
        return 'Score: ' + score;
    }

    function getServerVersion(o) {
        return 'Server version: ' + o.name + ' ' + o.version;
    }

    return o;
})();