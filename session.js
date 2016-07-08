/**
 * Created by kaloyan on 6.7.2016 г..
 */

module.exports = class Session{
    constructor(socket) {
        

        //register services here
        socket.services[0x65446991] = function (header, data){
            if (header.method_id == 1){
                
            }
        };

        
    }
};