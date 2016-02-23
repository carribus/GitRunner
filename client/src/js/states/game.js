/**
 * Created by petermares on 20/02/2016.
 */

module.exports = (function() {
    var settings = require('../../settings');
    var RestJS = require('rest-js');
    var o = {};
    var assetPath;
    var _tiles = {};
    var player;
    var state = 'waiting';

    var spinner;

    // groups
    var platforms, nonCollisionGroup;
    var obstacles, monsters;

    var levelOffset;

    var level, levelGenerationIteration = 1;

    var levels = [];
    var currentLevelIndex = 0;
    var previousLevelLength = 0;
    var isLoadingLevel = false;
    var nextSignposts, currentRepoIndex;

    var numJumps = 0;
    var gameOverLabel;
    var deathEmitter, jumpEmitter;
    var scoreText, repoText, currentRepoText;
    var cursors, spacebar;
    var music, jump, drop, drop_end, soundsEnabled = true;
    var sndClick, sndDie, sndDown, sndKillMonster;

    var homeButton;
    var btnVolOn, btnVolOff
    var userName = 'Your Name';

    var pathLength = 0;

    var reposVisitedGUI = [];

    // temporary usage..
    var grayFilter;

    var next_position = {};
    var empty_gaps = [];

    // enable/disable collisions - great for testing a long a run
    var COLLIDE_ENABLED = true;
    // if this is set to true, levels will be reduced to 50 tiles - used to test level changing features
    // do not expect levels to accurately represent monsters, obstacles etc when this is on.
    var MAKE_SHORT_LEVELS = false;

    o.preload = function() {
        console.log('Selected Character: ' + settings.selectedCharacter);

        assetPath = 'assets/world' + Math.floor(1 + Math.random()*2) + '/';
        _tiles = {
            tile_floor: assetPath + 'tl/tl1.png',
            tile_bkg: assetPath + 'bg/bg.png',
            tile_obstacle1: assetPath + 'ob/ob1.png',
            tile_obstacle2: assetPath + 'ob/ob2.png',
            tile_obstacle3: assetPath + 'ob/ob3.png',
            tile_obstacle4: assetPath + 'ob/ob4.png',
            tile_monster1: assetPath + 'mo/mo1.png',
            tile_monster2: assetPath + 'mo/mo2.png',
            tile_monster3: assetPath + 'mo/mo3.png',
            tile_monster4: assetPath + 'mo/mo4.png'
        };

        this.game.stage.backgroundColor = '#000';

        // load images
        for (var k in _tiles) {
            if (_tiles.hasOwnProperty(k) ) {
                this.load.image(k, _tiles[k]);
            }
        }

        this.load.spritesheet('dude', 'assets/' + settings.selectedCharacter + '.png', 48, 64);

        this.game.load.json('level', 'http://' + settings.server.host + ':' + settings.server.port + '/game/start/' + settings.playerID);

        // temporary usage..
        this.game.load.script('gray', 'https://cdn.rawgit.com/photonstorm/phaser/master/filters/Gray.js');
    };

    o.create = function() {
        console.log('Game.create');


        state = 'waiting';
        next_position = {};
        empty_gaps = [];
        reposVisitedGUI = [];
        soundsEnabled = true;
        pathLength = 0;

        cursors = this.game.input.keyboard.createCursorKeys();
        cursors.spacebar = this.game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

        music = this.game.add.audio('guitar', 1, true);
        jump = this.game.add.audio('jump', 1);
        drop = this.game.add.audio('drop', 1);
        drop_end = this.game.add.audio('drop_end', 1);
        sndClick = this.game.add.audio('click');
        sndDie = this.game.add.audio('die');
        sndDown = this.game.add.audio('down');
        sndKillMonster = this.game.add.audio('kill_monster');

        // temporary usage..
        grayFilter = this.game.add.filter('Gray');

        level = this.game.cache.getJSON('level');
        if ( MAKE_SHORT_LEVELS ) level.size = 50;
        levels[currentLevelIndex] = level;
        level = levels[currentLevelIndex];
        isLoadingLevel = false;
        nextSignposts = [];
        currentRepoIndex = 0;

        var imgData = new Image();
        imgData.src = level.avatar;
        this.game.cache.addImage('repo-avatar' + currentLevelIndex, level.avatar, imgData);

        var sky = this.game.add.sprite(0, 0, 'tile_bkg');
        sky.width = settings.display.width;

        nonCollisionGroup = this.game.add.group();
        nonCollisionGroup.enableBody = true;

        platforms = this.game.add.group();
        platforms.enableBody = true;

        obstacles = this.game.add.group();
        obstacles.enableBody = true;

        monsters = this.game.add.group();
        monsters.enableBody = true;

        levelOffset = Math.floor(256/64);
        level.size += levelOffset;
        var levelSize = 20;
        for ( levelGenerationIteration = 1; levelGenerationIteration <= levelSize; levelGenerationIteration++ ) {
            //if (level.gaps) {
                o.generateNextGap(levelGenerationIteration, platforms);
            //}

            if(level.obstacles) {
                o.generateNextObstacle(levelGenerationIteration, obstacles);
            }

            if(level.monsters) {
                o.generateNextMonster(levelGenerationIteration, monsters);
            }
        }

        // create the avatar image
        o.createAvatar(0);

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
        gameOverLabel = this.game.add.text(this.game.world.centerX, this.game.world.centerY-200, 'Game Over', {font: 'bold 72pt arial', fill: '#F00'});
        gameOverLabel.anchor.set(0.5);
        gameOverLabel.visible = false;
        scoreText = this.game.add.text(0, 0, returnCurrentScore(0), {
            font: '24pt Arial',
            align: 'center',
            boundsAlignH: 'left',
            boundsAlignV: 'top'
        });
        scoreText.setTextBounds(10, 10, 150, 0);
        currentRepoText = this.game.add.text(10, 48, '', {font: 'normal 16pt arial'});

        repoText = this.game.add.text(this.game.world.centerX, this.game.world.centerY - 125, 'Visited Repositories', {font: 'bold 24pt arial'});
        repoText.anchor.set(0.5, 0);
        repoText.visible = false;

        // emitters
        jumpEmitter = this.game.add.emitter(this.game.world.centerX, 0);
        jumpEmitter.makeParticles('star');
        jumpEmitter.gravity = 400;
        jumpEmitter.setAlpha(0, 1);
        jumpEmitter.setScale(0.5, 0.75, 0.5, 0.75);

        deathEmitter = this.game.add.emitter(this.game.world.centerX, 0, 100);
        deathEmitter.makeParticles('heart');
        deathEmitter.gravity = 300;

        btnVolOff = this.game.add.button(this.game.world.width - 60, 25, 'volumeOff', playPauseSound, this);
        btnVolOff.scale.set(0.5);
        btnVolOff.visible = false;
        btnVolOn = this.game.add.button(this.game.world.width - 60, 25, 'volumeOn', playPauseSound, this);
        btnVolOn.scale.set(0.5);

        homeButton = this.game.add.button(this.game.world.centerX, 410, 'home_button', backToMainMenu, this);
        homeButton.width = homeButton.height = 96;
        homeButton.visible = false;

        // Repos visited GUI objects
        o.addVisitedRepo(level);
    };

    o.addVisitedRepo = function(l) {
        var i = this.game.add.sprite(this.game.world.centerX-200, this.game.world.centerY - 75 + reposVisitedGUI.length*32, 'repo-avatar' + reposVisitedGUI.length);
        var t = this.game.add.text(this.game.world.centerX-152, this.game.world.centerY - 75 + reposVisitedGUI.length*32, l.owner + '/' + l.repository, {font: 'normal 16pt arial'});

        i.width = 24;
        i.height = 24;
        t.height = 24;
        t.visible = false;
        i.visible = false;

        reposVisitedGUI.push({
            avatar: i,
            text: t
        });
    }

    o.createAvatar = function(startPos) {
        console.log('Creating signpost at ' + startPos);
        var signpost = nonCollisionGroup.create(startPos + 64, this.game.world.height-64, 'signpost');
        signpost.anchor.set(0, 1);
        var avatar = nonCollisionGroup.create(signpost.x + 18, 245, 'repo-avatar' + currentLevelIndex);
        avatar.width = 200;
        avatar.height = 165;

        nextSignposts.push(signpost);
    };

    function backToMainMenu() {
        if ( soundsEnabled ) sndClick.play();
        this.state.start('mainmenu');
    }

    o.update = function() {
        if (!music.isPlaying && soundsEnabled) {
            music.play();
            drop.play();
        }

        this.game.physics.arcade.collide(player, platforms);
        switch (state) {
            case 'waiting':
                if (player.body.touching.down) {
                    state = 'running';
                    if(soundsEnabled) drop_end.play();
                }
                break;

            case 'running':
                if ( !COLLIDE_ENABLED || (COLLIDE_ENABLED && !this.game.physics.arcade.collide(player, obstacles, onObstacleCollide)) ) {
                    this.run();
                }
                break;

            case 'dead':
                this.gameOver();
                break;
        }
    };

    o.shutdown = function() {
        music.stop();
    };

    o.generateNextGap = function(i, platforms, runSpeed) {
        var min, max, rnd_position, expected_position, ground;
        var levelSize = previousLevelLength + level.size - levelOffset;
        i += previousLevelLength;

        runSpeed = runSpeed || 0;

        expected_position = Math.floor(levelSize / level.gaps);

        if(!next_position.gaps) next_position.gaps = expected_position;

        //if(i/expected_position === Math.floor(i/expected_position) && next_position.gaps) {
        //
        //    if(i === next_position.gaps) {
        //        min = next_position.gaps * 0.9;
        //        max = next_position.gaps * 1.1;
        //        rnd_position = Math.floor(Math.random() * (max - min) + min) * 64;
        //
        //        if(this.game.world.centerX < rnd_position) {
        //            console.log('generating gap at position: ' + rnd_position);
        //
        //            empty_gaps.push(rnd_position / 64);
        //        }
        //
        //        next_position.gaps = i + expected_position;
        //    }
        //}
        //
        //if((empty_gaps).indexOf(i) === -1) {
        //    ground = platforms.create((i-1) * 64, this.game.world.height-64, 'tile_floor');
        //    ground.body.immovable = true;
        //    ground.scale.set(0.5, 0.5);
        //    ground.body.friction.x = 0;
        //}
        var lastChild = platforms.total > 0 ? platforms.getChildAt(platforms.total-1) : null;
        var nextX = lastChild ? lastChild.x + lastChild.width - Math.ceil(runSpeed/64) - 2: (i-1) * 64;
        ground = platforms.create(nextX, this.game.world.height-64, 'tile_floor');
        ground.body.immovable = true;
        ground.scale.set(0.5, 0.5);
        ground.body.friction.x = 0;
    };

    o.generateNextObstacle = function(i, obstacles) {
        var min, max, rnd_position, expected_position, obstacle;
        var levelSize = previousLevelLength + level.size - levelOffset;

        level.obstaclesCreated = level.obstaclesCreated || 0;
        if ( level.obstaclesCreated < level.obstacles ) {
            expected_position = Math.floor((levelSize) / level.obstacles);

            if(i/expected_position === Math.floor(i/expected_position) && next_position.obstacles) {
                if(i === next_position.obstacles) {
                    min = next_position.obstacles * 0.9;
                    max = next_position.obstacles * 1.1;

                    if ( max > level.size ) max = level.size-1;

                    rnd_position = Math.floor(Math.random() * (max - min) + min) * 64;

                    if(this.game.world.centerX < rnd_position) {
                        console.log('generating obstacle at position: ' + rnd_position);

                        obstacle = obstacles.create(rnd_position, this.game.world.height - 64, 'tile_obstacle' + Math.floor(1 + Math.random()*4));
                        obstacle.body.setSize(obstacle.width * 0.8, obstacle.height * 0.8, obstacle.width * 0.1, obstacle.height * 0.1);
                        obstacle.anchor.set(0, 1);
                        obstacle.body.immovable = true;
                        level.obstaclesCreated++;
                    }
                }

                next_position.obstacles = i + expected_position;
            } else if(!next_position.obstacles) {
                next_position.obstacles = expected_position;
            }

        }
    };

    o.generateNextMonster = function(i, monsters) {
        var min, max, rnd_position, expected_position, monster;
        var levelSize = previousLevelLength + level.size - levelOffset;

        level.monstersCreated = level.monstersCreated || 0;
        if ( level.monstersCreated < level.monsters ) {
            expected_position = Math.floor((levelSize) / level.monsters);

            if(i/expected_position === Math.floor(i/expected_position) && next_position.monsters) {
                if(i === next_position.monsters) {
                    min = next_position.monsters * 0.9;
                    max = next_position.monsters * 1.1;
                    rnd_position = Math.floor(Math.random() * (max - min) + min) * 64;

                    if(this.game.world.centerX < rnd_position) {
                        console.log('generating monster at position: ' + rnd_position);

                        monster = monsters.create(rnd_position, this.game.world.height - 64, 'tile_monster' + Math.floor(1 + Math.random()*4));
                        monster.body.setSize(monster.width * 0.8, monster.height * 0.8, monster.width * 0.1, monster.height * 0.1);
                        monster.anchor.set(0, 1);
                        monster.body.immovable = true;

                        this.game.add.tween(monster).to({ y: this.game.world.height - monster.height * 2 }, 300, Phaser.Easing.Sinusoidal.Out, true, 0, -1, true)
                        level.monstersCreated++;
                    }
                }

                next_position.monsters = i + expected_position;
            } else if (!next_position.monsters) {
                next_position.monsters = expected_position;
            }
        }
    }

    function onObstacleCollide(player, obstacle) {
        killPlayer();
    }

    function onMonsterCollide(player, monster) {
        if ( (player.body.touching.down || player.body.touching.up) && !player.body.touching.right ) {
            player.body.velocity.y = -500;
            numJumps = 0;
            monster.kill();
        } else {
            killPlayer();
        }
    }

    o.run = function() {
        var isJumping = !player.body.touching.down;
        var runSpeed = 250;
        var score = Math.round((0-pathLength / 64)*100)/100;

        runSpeed += score/4;

        this.lastTime = this.lastTime || this.game.time.now;

        if ( levelGenerationIteration < level.size ) {
            //if (level.gaps) {
                o.generateNextGap(levelGenerationIteration, platforms, runSpeed);
            //}

            if(level.obstacles) {
                o.generateNextObstacle(levelGenerationIteration, obstacles);
            }

            if(level.monsters) {
                o.generateNextMonster(levelGenerationIteration, monsters);
            }
            levelGenerationIteration++;
        } else {
            if ( currentLevelIndex < levels.length-1 ) {
                console.log('Generating next levels map: ' + (currentLevelIndex+1));
                previousLevelLength += level.size;
                levelGenerationIteration = 0;
                level = levels[++currentLevelIndex];
                o.createAvatar(previousLevelLength*64);
                o.addVisitedRepo(level);
            }
        }

        updateRunnerSpeedTo(runSpeed);

        // check if we've changed repos
        for ( var s = 0, len = nextSignposts.length; s < len; s++ ) {
            if ( nextSignposts[s].x + nextSignposts[s].width/2 < player.x ) {
                currentRepoIndex = s;
            } else {
                break;
            }
        }
        currentRepoText.text = 'Repo: ' + levels[currentRepoIndex].owner + '/' + levels[currentRepoIndex].repository;
        //console.log('Current Repo Index = ' + currentRepoIndex);

        // now check collissions
        if ( COLLIDE_ENABLED ) {
            if ( (player.body.bottom >= settings.display.height || player.body.touching.right) ) {
                // kill the player and end the game
                killPlayer();
                return;
            }

            if ( this.game.physics.arcade.collide(player, monsters, onMonsterCollide) ) {
                if ( state == 'dead' ) {
                    return;
                } else {
                    if (soundsEnabled) sndKillMonster.play()
                }
            }
        }

        scoreText.setText(returnCurrentScore(score));

        if (cursors.up.isDown || cursors.spacebar.isDown) {
            // enable a single and double jump.
            // doubleJumps are only allowed on a certain part of the initial jump arc
            if ( player.body.velocity.y > -100 && numJumps < 2 ) {
                player.body.velocity.y = -275;
                if(soundsEnabled) jump.play();
                numJumps++;

                jumpEmitter.x = player.worldPosition.x + player.width/2;
                jumpEmitter.y = player.worldPosition.y + player.height/2;
                jumpEmitter.start(true, 1000, null, 15);
            }
        }
        if (cursors.down.isDown && player.body.velocity.y > -150 ) {
            player.body.velocity.y = 800;
            if ( soundsEnabled ) sndDown.play();
        }

        if (isJumping) {
            player.animations.play('jump');
        } else {
            player.animations.play('right');
            numJumps = 0;
        }

        if ( score > (previousLevelLength + level.size/2) && !isLoadingLevel ) {
            if ( currentLevelIndex < levels.length ) {
                o.fetchNextLevel(level.gameID, settings.playerID)
            }
        }
    };

    o.fetchNextLevel = function(gameID, playerID) {
        var _this = this;
        isLoadingLevel = true;

        var rest = RestJS('http://' + settings.server.host + ':' + settings.server.port, {
            crossDomain: true,
            defaultFormat: null
        });

        rest.get('/game/next/' + gameID + '/' + settings.playerID, function(error, data) {
            if ( MAKE_SHORT_LEVELS ) data.size = 50;
            levels[currentLevelIndex+1] = data;

            var imgData = new Image();
            imgData.src = data.avatar;
            _this.game.cache.addImage('repo-avatar' + (currentLevelIndex+1), data.avatar, imgData);

            isLoadingLevel = false;
        });
    };

    o.gameOver = function() {
        homeButton.visible = true;
        gameOverLabel.visible = true;
        var scale = player.scale;
        if ( scale.x > 0 ) {
            scale.x -= 0.05;
            scale.y -= 0.05;
            player.scale = scale;
        }

        repoText.visible = true;

        for ( var i = 0; i < Math.min(6, reposVisitedGUI.length); i++ ) {
            reposVisitedGUI[i].avatar.visible = true;
            reposVisitedGUI[i].text.visible = true;
        }
    };

    function playPauseSound() {
        if(music.isPlaying) {
            soundsEnabled = false;
            music.pause();
            btnVolOn.visible = false;
            btnVolOff.visible = true;
        } else {
            soundsEnabled = true;
            music.play();
            btnVolOff.visible = false;
            btnVolOn.visible = true;
        }
    }

    function updateRunnerSpeedTo(speed) {
        speed = speed < 850 ? speed : 850;

        var targetArrays = [ obstacles, monsters, nonCollisionGroup];

        platforms.forEach(function(ground) {
            if(ground.worldPosition.x < -100) {
                pathLength += ground.worldPosition.x;
                platforms.remove(ground, true);
            } else {
                ground.body.velocity.x = -speed;
            }
        }, this);

        targetArrays.forEach(function(arr) {
            arr.forEach(function(o) {
                if(o.worldPosition.x < -100) {
                    arr.remove(o, true);
                } else {
                    o.body.velocity.x = -speed;
                }
            }, this);
        }, this);
/*
        obstacles.forEach(function(obstacle) {
            if(obstacle.worldPosition.x < -100) {
                platforms.remove(obstacle, true);
            } else {
                obstacle.body.velocity.x = -speed;
            }
        }, this);

        monsters.forEach(function(monster) {
            if(monster.worldPosition.x < -100) {
                platforms.remove(monster, true);
            } else {
                monster.body.velocity.x = -speed;
            }
        }, this);

        nonCollisionGroup.forEach(function(o) {
            if(o.worldPosition.x < -100) {
                platforms.remove(o, true);
            } else {
                o.body.velocity.x = -speed;
            }
        }, this);
*/
    }

    function killPlayer() {
        if ( soundsEnabled ) sndDie.play();
        state = 'dead';
        updateRunnerSpeedTo(0);
        deathEmitter.x = player.worldPosition.x + player.width / 2;
        deathEmitter.y = player.worldPosition.y + player.height / 2;
        deathEmitter.start(true, 2000, null, 15);

        setTimeout(function() {
            userName = window.prompt('Enter your name for the leaderboard', userName);

            var rest = RestJS('http://' + settings.server.host + ':' + settings.server.port, {
                crossDomain: true,
                defaultFormat: null
            });

            var obj = {
                playerID: settings.playerID,
                gameID: level.gameID,
                nickname: userName,
                score: Math.round((0-pathLength / 64) * 100) / 100
            };

            //console.log('Sending score: ' + JSON.stringify(obj));

            rest.post('/score', {data: obj}, function (error, data) {
            });

        }, 1000);
    }

    function returnCurrentScore(score) {
        score = Math.round(score*100)/100;
        return 'Distance: ' + score + 'm';
    }

    return o;
})();